import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { PushModule } from "../push/push.module";
import { DailyReportService } from "./daily-report.service";
import { DailyReportScheduler } from "./daily-report.scheduler";

@Module({
  imports: [MailModule, PushModule],
  providers: [DailyReportService, DailyReportScheduler],
  exports: [DailyReportService],
})
export class DailyReportModule {}
