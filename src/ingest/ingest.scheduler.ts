import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { IngestService, SyncResult } from "./ingest.service";

function isEnabled(): boolean {
  const v = (process.env.INGEST_ENABLED ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

@Injectable()
export class IngestScheduler implements OnModuleInit {
  private readonly logger = new Logger(IngestScheduler.name);
  private readonly runningProviders = new Set<string>();

  constructor(private readonly ingest: IngestService) {}

  async onModuleInit() {
    if (!isEnabled()) {
      this.logger.log("Ingest disabled via INGEST_ENABLED");
      return;
    }
    setTimeout(() => this.startupIngest(), 5000);
  }

  private async startupIngest() {
    try {
      const r = await this.ingest.runAll("scheduled");
      this.logger.log(
        `Startup ingest: ` +
          `IQAir=${r.iqair?.aq_points ?? 0}aq+${r.iqair?.weather_points ?? 0}w, ` +
          `OpenWeather=${r.openweather?.aq_points ?? 0}aq+${r.openweather?.weather_points ?? 0}w, ` +
          `OpenMeteo=${r.openmeteo?.aq_points ?? 0}aq+${r.openmeteo?.weather_points ?? 0}w, ` +
          `WAQI=${r.waqi?.aq_points ?? 0}aq, errors=${r.total_errors.length}`,
      );
    } catch (e: any) {
      this.logger.warn(`Startup ingest skipped: ${e?.message}`);
    }
  }

  private async runProvider(name: string, fn: () => Promise<SyncResult>) {
    if (this.runningProviders.has(name)) {
      this.logger.warn(`${name} ingest already running — skipping`);
      return;
    }
    this.runningProviders.add(name);
    try {
      const r = await fn();
      this.logger.log(
        `Cron ${name}: aq=${r.aq_points}, weather=${r.weather_points}, errors=${r.errors.length}`,
      );
    } catch (e: any) {
      this.logger.error(`Cron ${name} failed: ${e?.message}`);
    } finally {
      this.runningProviders.delete(name);
    }
  }

  // Open-Meteo: mỗi 1 giờ, phút 0 (free, không giới hạn quota)
  @Cron(process.env.INGEST_OPENMETEO_CRON ?? "0 * * * *")
  async cronOpenMeteo() {
    if (!isEnabled()) return;
    await this.runProvider("OpenMeteo", () => this.ingest.runOpenMeteo("scheduled"));
  }

  // OpenWeather: mỗi 3 giờ, phút 15 (free tier 1000 req/ngày)
  @Cron(process.env.INGEST_OPENWEATHER_CRON ?? "15 */3 * * *")
  async cronOpenWeather() {
    if (!isEnabled()) return;
    await this.runProvider("OpenWeather", () => this.ingest.runOpenweather("scheduled"));
  }

  // IQAir: mỗi 6 giờ, phút 30 (free tier 10.000 req/tháng)
  @Cron(process.env.INGEST_IQAIR_CRON ?? "30 */6 * * *")
  async cronIqair() {
    if (!isEnabled()) return;
    await this.runProvider("IQAir", () => this.ingest.runIqair("scheduled"));
  }

  // WAQI: mỗi 12 giờ, phút 45
  @Cron(process.env.INGEST_WAQI_CRON ?? "45 */12 * * *")
  async cronWaqi() {
    if (!isEnabled()) return;
    await this.runProvider("WAQI", () => this.ingest.runWaqi("scheduled"));
  }
}
