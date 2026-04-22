import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.prediction_runs' })
export class PredictionRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'PipelineRun',
    fieldName: 'pipeline_run_id',
    onDelete: 'CASCADE',
    unique: true,
    ref: true,
  })
  pipelineRunId!: string;

  @ManyToOne({
    entity: () => 'ModelVersion',
    fieldName: 'model_version_id',
    onDelete: 'CASCADE',
    ref: true,
  })
  modelVersionId!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property({ type: 'datetime' })
  baseTime!: Date;

  @Property({ type: 'integer' })
  horizonHours!: number;

  @Property({ default: 'queued' })
  status!: string;

  @Property({ type: 'jsonb', default: '{}' })
  summary!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
