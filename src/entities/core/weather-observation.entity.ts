import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'core.weather_observations' })
@Unique({ properties: ['stationId', 'observedAt', 'sourceEndpointId'] })
export class WeatherObservation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', deleteRule: 'cascade', ref: true })
  stationId!: string;

  @ManyToOne({
    entity: () => 'SourceProvider',
    fieldName: 'source_provider_id',
    deleteRule: 'no action',
    ref: true,
  })
  sourceProviderId!: string;

  @ManyToOne({
    entity: () => 'SourceEndpoint',
    fieldName: 'source_endpoint_id',
    deleteRule: 'no action',
    ref: true,
  })
  sourceEndpointId!: string;

  @ManyToOne({
    entity: () => 'PipelineRun',
    fieldName: 'pipeline_run_id',
    deleteRule: 'no action',
    ref: true,
  })
  pipelineRunId!: string;

  @ManyToOne({
    entity: () => 'RawPayload',
    fieldName: 'raw_payload_id',
    deleteRule: 'set null',
    nullable: true,
    ref: true,
  })
  rawPayloadId?: string;

  @ManyToOne({
    entity: () => 'NormalizeRun',
    fieldName: 'normalize_run_id',
    deleteRule: 'set null',
    nullable: true,
    ref: true,
  })
  normalizeRunId?: string;

  @Property({ type: 'datetime' })
  observedAt!: Date;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  fetchedAt!: Date;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  temperatureC?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  feelsLikeC?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  humidityPct?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  windSpeedMps?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  windDirectionDeg?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  pressureHpa?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  visibilityKm?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  precipitationMm?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  cloudCoverPct?: number;

  @Property({ nullable: true })
  weatherCode?: string;

  @Property({ default: 'valid' })
  qualityStatus!: string;
  // quality_status_enum: 'valid', 'questionable', 'suspect', 'corrected'

  @Property({ type: 'jsonb', default: '{}' })
  lineage!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
