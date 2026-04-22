import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AlertEvaluatorService } from "./alert-evaluator.service";

@Injectable()
export class AlertScheduler implements OnModuleInit {
  private readonly logger = new Logger(AlertScheduler.name);

  constructor(private readonly evaluator: AlertEvaluatorService) {}

  /** Chạy lần đầu sau 30 giây để DB sẵn sàng */
  async onModuleInit() {
    setTimeout(() => {
      this.logger.log("Initial alert evaluation (30s after boot)");
      this.runEvaluation();
    }, 30_000);
  }

  /** Mỗi 30 phút kiểm tra tất cả rules */
  @Cron(process.env.ALERT_CRON ?? "*/30 * * * *")
  async runEvaluation() {
    this.logger.log("Alert evaluation started");
    try {
      const count = await this.evaluator.evaluate();
      this.logger.log(`Alert evaluation done — ${count} alerts created`);
    } catch (err) {
      this.logger.error(`Alert evaluation failed: ${err}`);
    }
  }
}
