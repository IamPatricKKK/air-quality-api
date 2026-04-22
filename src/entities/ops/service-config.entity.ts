import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'ops.service_configs' })
@Unique({ properties: ['serviceName', 'configKey', 'scopeKey'] })
export class ServiceConfig {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  serviceName!: string;
  // service_name_enum: 'be_data', 'api_gateway', 'fe', 'mobile', 'python', etc.

  @Property()
  configKey!: string;

  @Property({ default: 'global' })
  scopeKey!: string;

  @Property({ type: 'jsonb' })
  value!: Record<string, any>;

  @ManyToOne({
    entity: () => 'User',
    fieldName: 'updated_by_user_id',
    onDelete: 'SET NULL',
    nullable: true,
    ref: true,
  })
  updatedByUserId?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  updatedAt!: Date;
}
