import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'ingest.source_providers' })
export class SourceProvider {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text', unique: true })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  category!: string;

  @Property({ type: 'text' })
  baseUrl!: string;

  @Property({ type: 'text', nullable: true })
  authType?: string;

  @Property({ type: 'int', nullable: true })
  rateLimitPerMinute?: number;

  @Property({ type: 'int', default: 30 })
  timeoutSeconds: number = 30;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'jsonb', default: '{}' })
  config: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
