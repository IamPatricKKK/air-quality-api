import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.training_runs' })
export class TrainingRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'PipelineRun',
    fieldName: 'pipeline_run_id',
    deleteRule: 'cascade',
    unique: true,
    ref: true,
  })
  pipelineRunId!: string;

  @ManyToOne({
    entity: () => 'ModelVersion',
    fieldName: 'model_version_id',
    deleteRule: 'cascade',
    ref: true,
  })
  modelVersionId!: string;

  @Property({ type: 'datetime', nullable: true })
  trainedFrom?: Date;

  @Property({ type: 'datetime', nullable: true })
  trainedTo?: Date;

  @Property({ type: 'integer', nullable: true })
  sampleCount?: number;

  @Property({ type: 'integer', nullable: true })
  featureSnapshotCount?: number;

  @Property({ type: 'jsonb', default: '{}' })
  metrics!: Record<string, any>;

  @Property({ default: 'queued' })
  status!: string;

  @Property({ nullable: true })
  errorMessage?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  startedAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  finishedAt?: Date;
}
