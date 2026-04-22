import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { PipelineRun } from './pipeline-run.entity';
import { SourceProvider } from './source-provider.entity';
import { SourceEndpoint } from './source-endpoint.entity';
import { Station } from '../catalog/station.entity';

@Entity({ tableName: 'ingest.outbound_requests' })
export class OutboundRequest {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PipelineRun, { onDelete: 'CASCADE' })
  pipelineRun!: PipelineRun;

  @ManyToOne(() => SourceProvider, { onDelete: 'CASCADE' })
  sourceProvider!: SourceProvider;

  @ManyToOne(() => SourceEndpoint, { onDelete: 'CASCADE' })
  sourceEndpoint!: SourceEndpoint;

  @ManyToOne(() => Station, { onDelete: 'SET NULL', nullable: true })
  station?: Station;

  @Property({ type: 'text' })
  requestUrl!: string;

  @Property({ type: 'text', default: 'GET' })
  requestMethod: string = 'GET';

  @Property({ type: 'jsonb', default: '{}' })
  requestParams: Record<string, any> = {};

  @Property({ type: 'int', nullable: true })
  httpStatus?: number;

  @Property({ type: 'text', nullable: true })
  status?: string;

  @Property({ type: 'int', default: 0 })
  retryCount: number = 0;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  requestStartedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  responseReceivedAt?: Date;

  @Property({ type: 'int', nullable: true })
  latencyMs?: number;

  @Property({ type: 'int', nullable: true })
  responseSizeBytes?: number;

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ type: 'text', nullable: true })
  correlationId?: string;
}
