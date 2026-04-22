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
    const rows = await this.em.getConnection().execute<{
      id: string;
      title: string;
      body: string;
      created_at: string;
      station_id: string | null;
    }>(`
      SELECT
        id,
        title,
        body,
        created_at,
        station_id
      FROM app.notifications
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `, [claims.sub]);

    return (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      message: row.body,
      is_read: false,
      created_at: row.created_at,
      type: "system",
      station_id: row.station_id ?? undefined,
    }));
  }
}
