import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.feature_snapshots' })
export class FeatureSnapshot {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', deleteRule: 'cascade', ref: true })
  stationId!: string;

  @ManyToOne({
    entity: () => 'PipelineRun',
    fieldName: 'built_from_pipeline_run_id',
    deleteRule: 'set null',
    nullable: true,
    ref: true,
  })
  builtFromPipelineRunId?: string;

  @Property({ type: 'datetime' })
  sourceWindowFrom!: Date;

  @Property({ type: 'datetime' })
  sourceWindowTo!: Date;

  @Property()
  featureSetVersion!: string;

  @Property({ type: 'jsonb' })
  features!: Record<string, any>;

  @Property({ type: 'integer', nullable: true })
  labelTargetAqi?: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  builtAt!: Date;
}
