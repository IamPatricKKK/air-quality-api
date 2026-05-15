import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { PipelineRun } from './pipeline-run.entity';
import { RawPayload } from './raw-payload.entity';

@Entity({ tableName: 'ingest.normalize_runs' })
export class NormalizeRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PipelineRun, { deleteRule: 'cascade' })
  pipelineRun!: PipelineRun;

  @ManyToOne(() => RawPayload, { deleteRule: 'cascade' })
  rawPayload!: RawPayload;

  @Property({ type: 'text', nullable: true })
  parserKey?: string;

  @Property({ type: 'text', nullable: true })
  parserVersion?: string;

  @Property({ type: 'text', default: 'queued' })
  status: string = 'queued';

  @Property({ type: 'int', default: 0 })
  recordsIn: number = 0;

  @Property({ type: 'int', default: 0 })
  recordsOut: number = 0;

  @Property({ type: 'jsonb', default: '[]' })
  warnings: any[] = [];

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
