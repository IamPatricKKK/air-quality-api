import { Controller, Get } from "@nestjs/common";
import { userNotifications } from "../mock/mock.data";
import { queryRows } from "../db/database";

@Controller("notifications")
export class NotificationsController {
  @Get()
  async getNotifications() {
    const rows = await queryRows<{
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
      ORDER BY created_at DESC
      LIMIT 50
    `);

    if (rows) {
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.body,
        is_read: false,
        created_at: row.created_at,
        type: "system",
        station_id: row.station_id ?? undefined,
      }));
    }

    return userNotifications;
  }
}
