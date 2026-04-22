import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
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
