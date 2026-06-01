import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import webpush from "web-push";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  stationId?: string;
  aqi?: number;
  category?: string;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface QuietHoursRow {
  quiet_hours_enabled: boolean;
  quiet_hours_start_min: number;
  quiet_hours_end_min: number;
}

function isInQuietHours(nowMin: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Window crosses midnight (e.g. 22:00 → 07:00).
  return nowMin >= startMin || nowMin < endMin;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  constructor(private readonly em: EntityManager) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@air-quality.local";

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.configured = true;
      } catch (err) {
        // Invalid VAPID keys must not crash the whole API — just disable push.
        this.logger.warn(`Invalid VAPID keys — push notifications disabled: ${err}`);
      }
    } else {
      this.logger.warn(
        "VAPID keys not configured — push notifications disabled. Generate with `npx web-push generate-vapid-keys`.",
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async saveSubscription(userId: string, input: PushSubscriptionInput): Promise<{ id: string }> {
    const result = (await this.em.getConnection().execute(
      `INSERT INTO app.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent,
             last_used_at = now()
       RETURNING id`,
      [userId, input.endpoint, input.keys.p256dh, input.keys.auth, input.userAgent ?? null],
    )) as { rows?: { id: string }[] };
    const id = result.rows?.[0]?.id;
    if (!id) throw new Error("Failed to save push subscription");
    return { id };
  }

  async removeSubscription(userId: string, endpoint: string): Promise<{ success: boolean }> {
    await this.em.getConnection().execute(
      `DELETE FROM app.push_subscriptions WHERE endpoint = ? AND user_id = ?`,
      [endpoint, userId],
    );
    return { success: true };
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;

    const quietResult = (await this.em.getConnection().execute(
      `SELECT quiet_hours_enabled, quiet_hours_start_min, quiet_hours_end_min
       FROM app.user_preferences WHERE user_id = ? LIMIT 1`,
      [userId],
    )) as QuietHoursRow[] | { rows: QuietHoursRow[] };
    const quietRows: QuietHoursRow[] = Array.isArray(quietResult)
      ? quietResult
      : (quietResult.rows ?? []);
    const quiet = quietRows[0];
    if (quiet?.quiet_hours_enabled) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (isInQuietHours(nowMin, quiet.quiet_hours_start_min, quiet.quiet_hours_end_min)) {
        this.logger.log(`Skipping push for user ${userId}: in quiet hours`);
        return 0;
      }
    }

    const subsResult = (await this.em.getConnection().execute(
      `SELECT id, endpoint, p256dh, auth FROM app.push_subscriptions WHERE user_id = ?`,
      [userId],
    )) as StoredSubscription[] | { rows: StoredSubscription[] };
    const rows: StoredSubscription[] = Array.isArray(subsResult)
      ? subsResult
      : (subsResult.rows ?? []);

    if (rows.length === 0) return 0;

    const json = JSON.stringify(payload);
    let sent = 0;

    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            json,
          );
          sent += 1;
          await this.em.getConnection().execute(
            `UPDATE app.push_subscriptions SET last_used_at = now() WHERE id = ?`,
            [sub.id],
          );
        } catch (err: unknown) {
          const statusCode =
            typeof err === "object" && err !== null && "statusCode" in err
              ? (err as { statusCode: number }).statusCode
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            await this.em.getConnection().execute(
              `DELETE FROM app.push_subscriptions WHERE id = ?`,
              [sub.id],
            );
            this.logger.log(`Removed stale push subscription ${sub.id}`);
          } else {
            this.logger.error(`Push send failed for ${sub.endpoint}: ${String(err)}`);
          }
        }
      }),
    );

    return sent;
  }
}
