import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.analysis_runs' })
export class AnalysisRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'PipelineRun',
    fieldName: 'pipeline_run_id',
    deleteRule: 'cascade',
    ref: true,
    unique: true,
  })
  pipelineRunId!: string;

  @Property()
  analysisType!: string;
  // analysis_type_enum: 'correlation', 'trend', 'seasonal', 'health_impact', etc.

  @ManyToOne({
    entity: () => 'Station',
    fieldName: 'station_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  stationId?: string;

  @ManyToOne({
    entity: () => 'Area',
    fieldName: 'area_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  areaId?: string;

  @Property({ nullable: true })
  algorithmKey?: string;

  @Property({ nullable: true })
  algorithmVersion?: string;

  @Property({ type: 'datetime', nullable: true })
  periodFrom?: Date;

  @Property({ type: 'datetime', nullable: true })
  periodTo?: Date;

  @Property({ default: 'queued' })
  status!: string;
  // run_status_enum: 'queued', 'running', 'completed', 'failed'

  @Property({ type: 'jsonb', default: '{}' })
  summary!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
