import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PushModule } from "../push/push.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AlertRulesController } from "./alert-rules.controller";
import { AlertsController } from "./alerts.controller";
import { AlertRulesService } from "./alert-rules.service";
import { AlertEvaluatorService } from "./alert-evaluator.service";
import { EmailService } from "./email.service";
import { DeliveryDispatcher } from "./delivery-dispatcher.service";
import { AlertScheduler } from "./alert.scheduler";
import {
  UserAlertRule,
  Notification,
  NotificationDelivery,
  User,
  Station,
  AirQualityObservation,
} from "../entities";

@Module({
  imports: [
    PushModule,
    RealtimeModule,
    MikroOrmModule.forFeature([
      UserAlertRule,
      Notification,
      NotificationDelivery,
      User,
      Station,
      AirQualityObservation,
    ]),
  ],
  providers: [
    AlertRulesService,
    AlertEvaluatorService,
    EmailService,
    DeliveryDispatcher,
    AlertScheduler,
  ],
  controllers: [AlertRulesController, AlertsController],
  exports: [AlertEvaluatorService],
})
export class AlertsModule {}
