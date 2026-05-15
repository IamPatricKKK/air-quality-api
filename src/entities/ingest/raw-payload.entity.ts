import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { PipelineRun } from './pipeline-run.entity';
import { OutboundRequest } from './outbound-request.entity';
import { SourceProvider } from './source-provider.entity';
import { SourceEndpoint } from './source-endpoint.entity';
import { Station } from '../catalog/station.entity';

@Entity({ tableName: 'ingest.raw_payloads' })
@Unique({ properties: ['sourceProvider', 'payloadHash'] })
export class RawPayload {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => PipelineRun, { deleteRule: 'cascade' })
  pipelineRun!: PipelineRun;

  @ManyToOne(() => OutboundRequest, { deleteRule: 'set null', nullable: true })
  outboundRequest?: OutboundRequest;

  @ManyToOne(() => SourceProvider, { deleteRule: 'cascade' })
  sourceProvider!: SourceProvider;

  @ManyToOne(() => SourceEndpoint, { deleteRule: 'cascade' })
  sourceEndpoint!: SourceEndpoint;

  @ManyToOne(() => Station, { deleteRule: 'set null', nullable: true })
  station?: Station;

  @Property({ type: 'text', default: 'json' })
  payloadFormat: string = 'json';

  @Property({ type: 'text' })
  payloadHash!: string;

  @Property({ type: 'jsonb', nullable: true })
  payloadJson?: Record<string, any>;

  @Property({ type: 'text', nullable: true })
  payloadText?: string;

  @Property({ type: 'text', nullable: true })
  storageUri?: string;

  @Property({ type: 'timestamptz', nullable: true })
  observedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  fetchedAt: Date = new Date();

  @Property({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any> = {};
}
