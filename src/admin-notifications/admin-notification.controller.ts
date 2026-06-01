import { Controller, Post, Headers } from "@nestjs/common";
import { requireAuth, requireRoles } from "../auth/jwt";
import { AdminNotificationService } from "./admin-notification.service";

@Controller("admin/notifications")
export class AdminNotificationController {
  constructor(private readonly adminNotifications: AdminNotificationService) {}

  /**
   * Send the system digest to all admins right now (instead of waiting for the
   * daily cron). Admin-only — handy for testing/demoing.
   */
  @Post("digest")
  async sendDigestNow(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ["admin", "super_admin"]);
    const sent = await this.adminNotifications.sendDailyDigest(24);
    return { success: true, recipients: sent };
  }
}
