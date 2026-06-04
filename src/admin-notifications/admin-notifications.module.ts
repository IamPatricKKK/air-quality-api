import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { PushModule } from "../push/push.module";
import { AdminNotificationService } from "./admin-notification.service";
import { AdminNotificationScheduler } from "./admin-notification.scheduler";
import { AdminNotificationController } from "./admin-notification.controller";

@Module({
  imports: [MailModule, PushModule],
  providers: [AdminNotificationService, AdminNotificationScheduler],
  controllers: [AdminNotificationController],
  exports: [AdminNotificationService],
})
export class AdminNotificationsModule {}
