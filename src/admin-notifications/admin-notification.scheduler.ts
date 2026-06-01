import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AdminNotificationService } from "./admin-notification.service";

@Injectable()
export class AdminNotificationScheduler {
  private readonly logger = new Logger(AdminNotificationScheduler.name);

  constructor(private readonly adminNotifications: AdminNotificationService) {}

  /** Daily system digest to admins. Default 08:00 every day. */
  @Cron(process.env.ADMIN_DIGEST_CRON ?? "0 8 * * *")
  async runDailyDigest() {
    this.logger.log("Daily admin digest started");
    try {
      const sent = await this.adminNotifications.sendDailyDigest(24);
      this.logger.log(`Daily admin digest done — sent to ${sent} admin(s)`);
    } catch (err) {
      this.logger.error(`Daily admin digest failed: ${err}`);
    }
  }
}
