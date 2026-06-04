import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "../alerts/email.service";
import { PushService } from "../push/push.service";
import { queryRow, queryRows } from "../db/database";

interface DigestData {
  windowHours: number;
  newUsers: { email: string; created_at: string }[];
  newUserCount: number;
  observationCount: number;
  ingestRuns: { status: string; count: number }[];
  ingestFailures: { error_summary: string | null; started_at: string }[];
  alertsFired: number;
}

export interface BroadcastInput {
  title: string;
  body: string;
  target: "all" | "region" | "user";
  targetValue?: string;
  channels: string[];
  scheduledAt?: string | null;
  sentBy: string; // admin user id
}

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
  ) {}

  // ─── Admin user helpers ───────────────────────────

  async getAdminEmails(): Promise<string[]> {
    const rows = (await this.em.getConnection().execute(
      `SELECT DISTINCT u.email
         FROM iam.users u
         JOIN iam.user_roles ur ON ur.user_id = u.id
         JOIN iam.roles r ON r.id = ur.role_id
        WHERE r.code IN ('admin', 'super_admin')
          AND u.status = 'active'`,
    )) as { email: string }[] | { rows: { email: string }[] };
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r) => r.email);
  }

  async getAdminUserIds(): Promise<{ id: string; email: string }[]> {
    const rows = await queryRows<{ id: string; email: string }>(
      `SELECT DISTINCT u.id, u.email
         FROM iam.users u
         JOIN iam.user_roles ur ON ur.user_id = u.id
         JOIN iam.roles r ON r.id = ur.role_id
        WHERE r.code IN ('admin', 'super_admin')
          AND u.status = 'active'`,
    );
    return rows ?? [];
  }

  // ─── Target resolution ────────────────────────────

  private async resolveTargetUsers(target: string, targetValue?: string): Promise<{ id: string; email: string }[]> {
    let rows: any[];
    switch (target) {
      case "all":
        rows = await queryRows<{ id: string; email: string }>(
          `SELECT id, email FROM iam.users WHERE status = 'active'`,
        ) ?? [];
        break;
      case "region":
        rows = await queryRows<{ id: string; email: string }>(
          `SELECT DISTINCT u.id, u.email
             FROM iam.users u
             JOIN app.user_preferences up ON up.user_id = u.id
            WHERE u.status = 'active'
              AND $1 = ANY(up.favorite_regions)`,
          [targetValue],
        ) ?? [];
        break;
      case "user":
        rows = await queryRows<{ id: string; email: string }>(
          `SELECT id, email FROM iam.users WHERE id = $1::uuid AND status = 'active'`,
          [targetValue],
        ) ?? [];
        break;
      default:
        rows = [];
    }
    return rows;
  }

  // ─── Broadcast ────────────────────────────────────

  async broadcast(input: BroadcastInput): Promise<{ recipientCount: number }> {
    const users = await this.resolveTargetUsers(input.target, input.targetValue);
    if (users.length === 0) return { recipientCount: 0 };

    const isScheduled = input.scheduledAt && new Date(input.scheduledAt) > new Date();
    const status = isScheduled ? "scheduled" : "sent";

    // Insert notification for each user
    for (const user of users) {
      try {
        await this.em.getConnection().execute(
          `INSERT INTO app.notifications
            (user_id, title, body, category, status, target_type, target_value, scheduled_at, sent_by, sent_at, source_context)
           VALUES (?, ?, ?, 'admin_broadcast', ?, ?, ?, ?, ?, ?, '{}'::jsonb)`,
          [
            user.id, input.title, input.body, status,
            input.target, input.targetValue ?? null,
            isScheduled ? input.scheduledAt : null,
            input.sentBy,
            isScheduled ? null : new Date().toISOString(),
          ],
        );

        // Dispatch immediately if not scheduled
        if (!isScheduled) {
          if (input.channels.includes("push")) {
            try {
              await this.pushService.sendToUser(user.id, {
                title: input.title,
                body: input.body,
                category: "admin_broadcast",
              });
            } catch (e: any) {
              this.logger.warn(`Push failed for ${user.email}: ${e?.message}`);
            }
          }
          if (input.channels.includes("email")) {
            try {
              await this.emailService.send({
                to: user.email,
                subject: input.title,
                html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px;">
                  <div style="background:#1a1a2e;color:#e0e0e0;padding:24px;border-radius:12px;">
                    <h2 style="color:#2dd4bf;margin:0 0 12px;">${input.title}</h2>
                    <p style="margin:0;line-height:1.6;">${input.body}</p>
                    <hr style="border:none;border-top:1px solid #374151;margin:16px 0;"/>
                    <p style="font-size:12px;color:#6b7280;margin:0;">Chat Luong Khong Khi Viet Nam</p>
                  </div>
                </div>`,
              });
            } catch (e: any) {
              this.logger.warn(`Email failed for ${user.email}: ${e?.message}`);
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`Broadcast to ${user.email} failed: ${e?.message}`);
      }
    }

    this.logger.log(`Broadcast "${input.title}" → ${users.length} users (${status})`);
    return { recipientCount: users.length };
  }

  // ─── Cancel scheduled ─────────────────────────────

  async cancelScheduled(notificationId: string): Promise<boolean> {
    const result = await queryRow<{ id: string }>(
      `UPDATE app.notifications SET status = 'cancelled'
       WHERE id = $1::uuid AND status = 'scheduled'
       RETURNING id`,
      [notificationId],
    );
    return !!result;
  }

  // ─── Admin Inbox ──────────────────────────────────

  async getAdminInbox(adminUserId: string, limit = 50, offset = 0) {
    return await queryRows<{
      id: string; title: string; body: string; category: string;
      isRead: boolean; sourceContext: any; createdAt: string;
    }>(
      `SELECT id, title, body, category,
              is_read AS "isRead",
              source_context AS "sourceContext",
              created_at AS "createdAt"
         FROM app.notifications
        WHERE user_id = $1::uuid
          AND category IN ('system_digest', 'ingest_result', 'alert_summary', 'admin_broadcast')
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [adminUserId, limit, offset],
    ) ?? [];
  }

  async getAdminInboxUnreadCount(adminUserId: string): Promise<number> {
    const row = await queryRow<{ count: number }>(
      `SELECT count(*)::int AS count FROM app.notifications
       WHERE user_id = $1::uuid
         AND category IN ('system_digest', 'ingest_result', 'alert_summary', 'admin_broadcast')
         AND is_read = FALSE`,
      [adminUserId],
    );
    return row?.count ?? 0;
  }

  async markInboxRead(notificationId: string, adminUserId: string): Promise<boolean> {
    const row = await queryRow<{ id: string }>(
      `UPDATE app.notifications SET is_read = TRUE, read_at = now()
       WHERE id = $1::uuid AND user_id = $2::uuid
       RETURNING id`,
      [notificationId, adminUserId],
    );
    return !!row;
  }

  async markAllInboxRead(adminUserId: string): Promise<number> {
    const rows = await queryRows<{ id: string }>(
      `UPDATE app.notifications SET is_read = TRUE, read_at = now()
       WHERE user_id = $1::uuid
         AND category IN ('system_digest', 'ingest_result', 'alert_summary', 'admin_broadcast')
         AND is_read = FALSE
       RETURNING id`,
      [adminUserId],
    );
    return rows?.length ?? 0;
  }

  // ─── System auto-notifications ────────────────────

  async createSystemNotification(params: {
    category: string;
    title: string;
    body: string;
    sourceContext?: Record<string, any>;
  }): Promise<void> {
    const admins = await this.getAdminUserIds();
    for (const admin of admins) {
      try {
        await this.em.getConnection().execute(
          `INSERT INTO app.notifications
            (user_id, title, body, category, status, source_context, sent_at)
           VALUES (?, ?, ?, ?, 'sent', ?::jsonb, now())`,
          [admin.id, params.title, params.body, params.category, JSON.stringify(params.sourceContext ?? {})],
        );
      } catch (e: any) {
        this.logger.warn(`System notification to ${admin.email} failed: ${e?.message}`);
      }
    }
  }

  // ─── Daily Report Config ──────────────────────────

  async getDailyConfig(): Promise<{ enabled: boolean; cron: string; userCount: number }> {
    const row = await queryRow<{ value: any }>(
      `SELECT value FROM app.system_config WHERE key = 'daily_report'`,
    );
    const config = row?.value ?? { enabled: true, cron: "0 6 * * *" };

    const countRow = await queryRow<{ count: number }>(
      `SELECT count(*)::int AS count FROM app.user_preferences WHERE daily_report_enabled = TRUE`,
    );

    return {
      enabled: config.enabled ?? true,
      cron: config.cron ?? "0 6 * * *",
      userCount: countRow?.count ?? 0,
    };
  }

  async updateDailyConfig(patch: { enabled?: boolean; cron?: string }): Promise<void> {
    const current = await this.getDailyConfig();
    const updated = {
      enabled: patch.enabled ?? current.enabled,
      cron: patch.cron ?? current.cron,
    };
    await queryRow(
      `INSERT INTO app.system_config (key, value, updated_at) VALUES ('daily_report', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
      [JSON.stringify(updated)],
    );
  }

  // ─── Daily Digest (existing) ──────────────────────

  private async gatherDigest(windowHours = 24): Promise<DigestData> {
    const win = `${windowHours} hours`;
    const conn = this.em.getConnection();

    const newUsers = (await conn.execute(
      `SELECT email, created_at FROM iam.users
        WHERE created_at > now() - ($1 || '')::interval
        ORDER BY created_at DESC`,
      [win],
    )) as any;
    const newUsersRows = Array.isArray(newUsers) ? newUsers : (newUsers.rows ?? []);

    const obs = (await conn.execute(
      `SELECT count(*)::int AS c FROM core.air_quality_observations
        WHERE created_at > now() - ($1 || '')::interval`,
      [win],
    )) as any;
    const obsCount = (Array.isArray(obs) ? obs[0] : obs.rows?.[0])?.c ?? 0;

    const runs = (await conn.execute(
      `SELECT status::text AS status, count(*)::int AS count
         FROM ingest.pipeline_runs
        WHERE started_at > now() - ($1 || '')::interval
        GROUP BY status`,
      [win],
    )) as any;
    const runsRows = Array.isArray(runs) ? runs : (runs.rows ?? []);

    const failures = (await conn.execute(
      `SELECT error_summary, started_at
         FROM ingest.pipeline_runs
        WHERE started_at > now() - ($1 || '')::interval
          AND status = 'failed'
        ORDER BY started_at DESC
        LIMIT 10`,
      [win],
    )) as any;
    const failuresRows = Array.isArray(failures) ? failures : (failures.rows ?? []);

    const alerts = (await conn.execute(
      `SELECT count(*)::int AS c FROM app.alerts
        WHERE created_at > now() - ($1 || '')::interval`,
      [win],
    )) as any;
    const alertsCount = (Array.isArray(alerts) ? alerts[0] : alerts.rows?.[0])?.c ?? 0;

    return {
      windowHours,
      newUsers: newUsersRows,
      newUserCount: newUsersRows.length,
      observationCount: obsCount,
      ingestRuns: runsRows,
      ingestFailures: failuresRows,
      alertsFired: alertsCount,
    };
  }

  private buildHtml(d: DigestData): string {
    const row = (label: string, value: string | number) => `
      <tr>
        <td style="padding: 8px 0; color: #9ca3af;">${label}</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${value}</td>
      </tr>`;

    const usersList = d.newUsers.length
      ? `<ul style="margin: 4px 0 0; padding-left: 18px; color: #e0e0e0;">${d.newUsers
          .slice(0, 20)
          .map((u) => `<li>${u.email}</li>`)
          .join("")}</ul>`
      : `<span style="color: #6b7280;">Khong co</span>`;

    const runsSummary = d.ingestRuns.length
      ? d.ingestRuns.map((r) => `${r.status}: ${r.count}`).join(" · ")
      : "Khong co";

    const failuresBlock = d.ingestFailures.length
      ? `<div style="margin-top: 12px; padding: 12px; background: #3b1212; border-radius: 8px;">
           <strong style="color: #fca5a5;">Cronjob loi (${d.ingestFailures.length}):</strong>
           <ul style="margin: 4px 0 0; padding-left: 18px; color: #fca5a5;">
             ${d.ingestFailures.map((f) => `<li>${(f.error_summary ?? "Khong ro").slice(0, 160)}</li>`).join("")}
           </ul>
         </div>`
      : "";

    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
          <h2 style="color: #2dd4bf; margin: 0 0 4px;">Bao cao he thong CLKKVN</h2>
          <p style="color: #9ca3af; margin: 0 0 16px; font-size: 13px;">Tong hop ${d.windowHours} gio qua</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${row("Nguoi dung moi dang ky", d.newUserCount)}
            ${row("Du lieu quan trac moi", d.observationCount)}
            ${row("Cronjob ingest", runsSummary)}
            ${row("Canh bao da kich hoat", d.alertsFired)}
          </table>
          <div style="margin-top: 14px;">
            <span style="color: #9ca3af; font-size: 13px;">Danh sach user moi:</span>
            ${usersList}
          </div>
          ${failuresBlock}
          <hr style="border: none; border-top: 1px solid #374151; margin: 16px 0;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Email tu dong gui toi quan tri vien — Chat Luong Khong Khi Viet Nam
          </p>
        </div>
      </div>`;
  }

  async sendDailyDigest(windowHours = 24): Promise<number> {
    const admins = await this.getAdminEmails();
    if (admins.length === 0) {
      this.logger.warn("No admin recipients — digest skipped");
      return 0;
    }

    const data = await this.gatherDigest(windowHours);
    const html = this.buildHtml(data);

    let sent = 0;
    for (const to of admins) {
      const ok = await this.emailService.send({
        to,
        subject: "[CLKKVN] Bao cao he thong hang ngay",
        html,
      });
      if (ok) sent++;
    }
    this.logger.log(`Daily digest sent to ${sent}/${admins.length} admin(s)`);
    return sent;
  }
}
