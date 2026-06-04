import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DailyReportService } from "./daily-report.service";

@Injectable()
export class DailyReportScheduler {
  private readonly logger = new Logger(DailyReportScheduler.name);

  constructor(private readonly dailyReport: DailyReportService) {}

  /** Daily air quality report to users. Default 06:00 every day (Asia/Ho_Chi_Minh). */
  @Cron(process.env.DAILY_REPORT_CRON ?? "0 6 * * *", {
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async runDailyReport() {
    this.logger.log("Daily air quality report started");
    try {
      const count = await this.dailyReport.sendDailyReport();
      this.logger.log(`Daily air quality report done — notified ${count} user(s)`);
    } catch (err) {
      this.logger.error(`Daily air quality report failed: ${err}`);
    }
  }
}
