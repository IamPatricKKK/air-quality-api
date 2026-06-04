import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { RealtimeModule } from "../realtime/realtime.module";
import { AdminNotificationsModule } from "../admin-notifications/admin-notifications.module";
import { IngestController } from "./ingest.controller";
import { IngestScheduler } from "./ingest.scheduler";
import { IngestService } from "./ingest.service";
import {
  SourceProvider,
  SourceEndpoint,
  StationSourceBinding,
  PipelineDefinition,
  PipelineRun,
  OutboundRequest,
  RawPayload,
  NormalizeRun,
  Station,
  AirQualityObservation,
  WeatherObservation,
} from "../entities";

@Module({
  imports: [
    RealtimeModule,
    AdminNotificationsModule,
    MikroOrmModule.forFeature([
      SourceProvider,
      SourceEndpoint,
      StationSourceBinding,
      PipelineDefinition,
      PipelineRun,
      OutboundRequest,
      RawPayload,
      NormalizeRun,
      Station,
      AirQualityObservation,
      WeatherObservation,
    ]),
  ],
  providers: [IngestService, IngestScheduler],
  controllers: [IngestController],
  exports: [IngestService],
})
export class IngestModule {}
