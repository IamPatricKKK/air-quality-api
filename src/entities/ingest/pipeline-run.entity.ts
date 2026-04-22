import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { PipelineDefinition } from './pipeline-definition.entity';
import { SourceEndpoint } from './source-endpoint.entity';
import { User } from '../iam/user.entity';

@Entity({ tableName: 'ingest.pipeline_runs' })
export class PipelineRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PipelineDefinition, { onDelete: 'CASCADE' })
  pipelineDefinition!: PipelineDefinition;

  @ManyToOne(() => SourceEndpoint, { onDelete: 'SET NULL', nullable: true })
  sourceEndpoint?: SourceEndpoint;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  requestedByUser?: User;

  @Property({ type: 'text', default: 'scheduled' })
  triggerType: string = 'scheduled';

  @Property({ type: 'jsonb', default: '{}' })
  scopePayload: Record<string, any> = {};

  @Property({ type: 'text', default: 'queued' })
  status: string = 'queued';

  @Property({ type: 'timestamptz', nullable: true })
  inputWindowFrom?: Date;

  @Property({ type: 'timestamptz', nullable: true })
  inputWindowTo?: Date;

  @Property({ type: 'jsonb', default: '{}' })
  metrics: Record<string, any> = {};

  @Property({ type: 'text', nullable: true })
  errorSummary?: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  startedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  finishedAt?: Date;

  @Property({ type: 'text', nullable: true })
  correlationId?: string;
}
