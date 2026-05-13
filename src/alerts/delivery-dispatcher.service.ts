import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "./email.service";
import { PushService } from "../push/push.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { Notification, User } from "../entities";

interface AlertForDispatch {
  id: string;
  user_id: string;
  station_id: string | null;
  title: string;
  message: string;
  metric: string;
  threshold: number;
  actual_value: number;
  aqi_category: string | null;
  channels: string[];
}

@Injectable()
export class DeliveryDispatcher {
  private readonly logger = new Logger(DeliveryDispatcher.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly realtime: RealtimeGateway,
    private readonly em: EntityManager,
  ) {}

  async dispatch(alert: AlertForDispatch): Promise<void> {
    this.realtime.broadcastAlert({
      user_id: alert.user_id,
      alert_id: alert.id,
      station_id: alert.station_id,
      title: alert.title,
      message: alert.message,
      category: alert.aqi_category,
    });

    for (const channel of alert.channels) {
      const deliveryId = await this.createDelivery(alert.id, channel);
      if (!deliveryId) continue;

      try {
        switch (channel) {
          case "in_app":
            await this.deliverInApp(alert);
            break;
          case "email":
            await this.deliverEmail(alert);
            break;
          case "push":
            await this.deliverPush(alert);
            break;
          default:
            this.logger.warn(`Unknown channel: ${channel}`);
        }
        await this.markDelivery(deliveryId, "sent");
      } catch (err) {
        this.logger.error(`Delivery ${deliveryId} failed (${channel}): ${err}`);
        await this.markDelivery(deliveryId, "failed", String(err));
      }
    }
  }

  private async deliverPush(alert: AlertForDispatch): Promise<void> {
    const sent = await this.pushService.sendToUser(alert.user_id, {
      title: alert.title,
      body: alert.message,
      tag: `alert-${alert.station_id ?? "global"}`,
      stationId: alert.station_id ?? undefined,
      aqi: alert.metric === "aqi" ? alert.actual_value : undefined,
      category: alert.aqi_category ?? undefined,
      url: alert.station_id ? `/stations/${alert.station_id}` : "/",
    });
    if (sent === 0) {
      this.logger.warn(`No push subscriptions for user ${alert.user_id}`);
    }
  }

  private async createDelivery(alertId: string, channel: string): Promise<string | null> {
    const result = await this.em.getConnection().execute(
      `INSERT INTO app.alert_deliveries (alert_id, channel, status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [alertId, channel],
    );
    return result.rows?.[0]?.id ?? null;
  }

  private async markDelivery(deliveryId: string, status: string, errorMessage?: string): Promise<void> {
    await this.em.getConnection().execute(
      `UPDATE app.alert_deliveries
       SET status = $2, error_message = $3, sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
       WHERE id = $1`,
      [deliveryId, status, errorMessage ?? null],
    );
  }

  private async deliverInApp(alert: AlertForDispatch): Promise<void> {
    const notification = this.em.create(Notification, {
      user: { id: alert.user_id } as any,
      title: alert.title,
      body: alert.message,
      station: alert.station_id ? { id: alert.station_id } as any : null,
      category: "alert",
      status: "pending",
    });
    await this.em.persistAndFlush(notification);
  }

  private async deliverEmail(alert: AlertForDispatch): Promise<void> {
    const user = await this.em.findOne(User, alert.user_id);
    if (!user?.email) {
      this.logger.warn(`No email found for user ${alert.user_id}`);
      return;
    }

    const categoryLabel = this.getCategoryLabel(alert.aqi_category);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 20px; border-radius: 12px;">
          <h2 style="color: #f59e0b; margin: 0 0 12px;">⚠️ ${alert.title}</h2>
          <p style="margin: 0 0 16px; line-height: 1.6;">${alert.message}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #9ca3af;">Chi so</td>
              <td style="padding: 6px 0; font-weight: bold;">${alert.metric.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #9ca3af;">Gia tri thuc</td>
              <td style="padding: 6px 0; font-weight: bold; color: #ef4444;">${alert.actual_value}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #9ca3af;">Nguong canh bao</td>
              <td style="padding: 6px 0;">${alert.threshold}</td>
            </tr>
            ${categoryLabel ? `<tr><td style="padding: 6px 0; color: #9ca3af;">Phan loai AQI</td><td style="padding: 6px 0;">${categoryLabel}</td></tr>` : ""}
          </table>
          <hr style="border: none; border-top: 1px solid #374151; margin: 16px 0;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            AirWatch Vietnam — He thong giam sat chat luong khong khi thoi gian thuc
          </p>
        </div>
      </div>
    `;

    await this.emailService.send({
      to: user.email,
      subject: `[AirWatch] ${alert.title}`,
      html,
    });
  }

  private getCategoryLabel(code: string | null): string {
    if (!code) return "";
    const labels: Record<string, string> = {
      good: "Tot",
      moderate: "Trung binh",
      unhealthy_sensitive: "Khong tot cho nhom nhay cam",
      unhealthy: "Khong tot",
      very_unhealthy: "Rat khong tot",
      hazardous: "Nguy hai",
    };
    return labels[code] ?? code;
  }
}
