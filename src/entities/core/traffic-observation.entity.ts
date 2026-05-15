import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'core.traffic_observations' })
export class TrafficObservation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'Area',
    fieldName: 'area_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  areaId?: string;

  @ManyToOne({
    entity: () => 'Station',
    fieldName: 'station_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  stationId?: string;

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

  @Property({ default: 'global' })
  segmentKey!: string;

  @Property({ nullable: true })
  roadName?: string;

  @Property({ type: 'datetime' })
  observedAt!: Date;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  fetchedAt!: Date;

  @Property({ type: 'integer', nullable: true })
  congestionIndex?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  avgSpeedKmh?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  freeFlowSpeedKmh?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  travelTimeMinutes?: number;

  @Property({ default: 'valid' })
  qualityStatus!: string;
  // quality_status_enum: 'valid', 'questionable', 'suspect', 'corrected'

  @Property({ type: 'jsonb', default: '{}' })
  lineage!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
