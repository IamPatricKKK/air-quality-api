import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'ingest.pipeline_definitions' })
export class PipelineDefinition {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text', unique: true })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  pipelineType!: string;

  @Property({ type: 'text', default: 'be_data' })
  ownerService: string = 'be_data';

  @Property({ type: 'text', nullable: true })
  scheduleExpression?: string;

  @Property({ type: 'text', default: 'Asia/Ho_Chi_Minh' })
  scheduleTimezone: string = 'Asia/Ho_Chi_Minh';

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'jsonb', default: '{}' })
  config: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
