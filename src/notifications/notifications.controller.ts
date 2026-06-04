import { Controller, Get, Headers } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Notification } from "../entities";
import { requireAuth } from "../auth/jwt";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async getNotifications(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    const rows: any = await this.em.getConnection().execute(`
      SELECT
        id, title, body, category, status, is_read,
        created_at, sent_at, read_at, station_id,
        source_context
      FROM app.notifications
      WHERE user_id = ?::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `, [claims.sub]);

    return (rows ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      message: row.body,
      type: row.category,
      status: row.status,
      is_read: row.is_read,
      created_at: row.created_at,
      sent_at: row.sent_at,
      read_at: row.read_at,
      station_id: row.station_id ?? undefined,
      source_context: row.source_context,
    }));
  }
}
