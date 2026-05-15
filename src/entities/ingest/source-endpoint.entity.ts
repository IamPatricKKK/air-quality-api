import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { SourceProvider } from './source-provider.entity';

@Entity({ tableName: 'ingest.source_endpoints' })
export class SourceEndpoint {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => SourceProvider, { deleteRule: 'cascade' })
  provider!: SourceProvider;

  @Property({ type: 'text', unique: true })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  kind!: string;

  @Property({ type: 'text', default: 'GET' })
  httpMethod: string = 'GET';

  @Property({ type: 'text' })
  path!: string;

  @Property({ type: 'text', nullable: true })
  scheduleExpression?: string;

  @Property({ type: 'text', default: 'Asia/Ho_Chi_Minh' })
  scheduleTimezone: string = 'Asia/Ho_Chi_Minh';

  @Property({ type: 'text', nullable: true })
  parserKey?: string;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'jsonb', default: '{}' })
  config: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
