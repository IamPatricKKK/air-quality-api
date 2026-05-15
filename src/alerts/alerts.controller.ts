import { Controller, Get, Patch, Param, Headers, Query } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { requireAuth } from "../auth/jwt";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async list(
    @Headers("authorization") authHeader?: string,
    @Query("limit") limitStr?: string,
  ) {
    const claims = requireAuth(authHeader);
    const limit = Math.min(parseInt(limitStr ?? "50", 10), 200);

    const rows: any = await this.em.getConnection().execute(
      `SELECT
         a.id, a.rule_id, a.station_id,
         s.name AS station_name,
         a.metric, a.threshold, a.actual_value, a.aqi_category,
         a.title, a.message, a.is_read, a.created_at
       FROM app.alerts a
       LEFT JOIN catalog.stations s ON s.id = a.station_id
       WHERE a.user_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [claims.sub, limit],
    );

    return Array.isArray(rows) ? rows : (rows.rows ?? []);
  }

  @Get("unread-count")
  async unreadCount(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    const row: any = await this.em.getConnection().execute(
      `SELECT COUNT(*)::TEXT AS count FROM app.alerts WHERE user_id = ? AND is_read = FALSE`,
      [claims.sub],
    );
    const r = row.rows ? row.rows[0] : row[0];
    return { count: parseInt(r?.count ?? "0", 10) };
  }

  @Patch(":id/read")
  async markRead(
    @Param("id") id: string,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    await this.em.getConnection().execute(
      `UPDATE app.alerts SET is_read = TRUE WHERE id = ? AND user_id = ?`,
      [id, claims.sub],
    );
    return { success: true };
  }

  @Patch("read-all")
  async markAllRead(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    await this.em.getConnection().execute(
      `UPDATE app.alerts SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`,
      [claims.sub],
    );
    return { success: true };
  }

  @Get("deliveries")
  async deliveries(
    @Headers("authorization") authHeader?: string,
    @Query("limit") limitStr?: string,
  ) {
    requireAuth(authHeader);
    const limit = Math.min(parseInt(limitStr ?? "100", 10), 500);

    const rows: any = await this.em.getConnection().execute(
      `SELECT
         d.id, d.alert_id, d.channel, d.status, d.error_message, d.sent_at, d.created_at,
         u.email AS user_email,
         s.name  AS station_name,
         a.title AS alert_title
       FROM app.alert_deliveries d
       JOIN app.alerts a ON a.id = d.alert_id
       LEFT JOIN iam.users u ON u.id = a.user_id
       LEFT JOIN catalog.stations s ON s.id = a.station_id
       ORDER BY d.created_at DESC
       LIMIT ?`,
      [limit],
    );

    return Array.isArray(rows) ? rows : (rows.rows ?? []);
  }
}
