import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { IngestService } from "./ingest.service";

function isEnabled(): boolean {
  const v = (process.env.INGEST_ENABLED ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

@Injectable()
export class IngestScheduler implements OnModuleInit {
  private readonly logger = new Logger(IngestScheduler.name);

  constructor(private readonly ingest: IngestService) {}

  async onModuleInit() {
    if (!isEnabled()) {
      this.logger.log("Ingest disabled via INGEST_ENABLED");
      return;
    }
    // Chạy 1 lần lúc khởi động (nếu DB đã có stations) để backfill ngay
    setTimeout(() => {
      this.ingest
        .runAll("scheduled")
        .then((r) =>
          this.logger.log(
            `Startup ingest: OpenMeteo=${r.openmeteo?.aq_points ?? 0}aq+${r.openmeteo?.weather_points ?? 0}w, WAQI=${r.waqi?.aq_points ?? 0}aq, errors=${r.total_errors.length}`,
          ),
        )
        .catch((e) => this.logger.warn(`Startup ingest skipped: ${e?.message}`));
    }, 5000);
  }

  // Cron mặc định: mỗi 12h vào phút 0 (00:00 và 12:00).
  // Có thể override bằng env INGEST_CRON nhưng phải khởi động lại service.
  @Cron(process.env.INGEST_CRON ?? "0 */12 * * *")
  async handleCron() {
    if (!isEnabled()) return;
    try {
      const r = await this.ingest.runAll("scheduled");
      this.logger.log(
        `Cron ingest OK: OpenMeteo=${r.openmeteo?.aq_points ?? 0}aq+${r.openmeteo?.weather_points ?? 0}w, WAQI=${r.waqi?.aq_points ?? 0}aq, errors=${r.total_errors.length}`,
      );
    } catch (e: any) {
      this.logger.error(`Cron ingest failed: ${e?.message}`);
    }
  }
}
