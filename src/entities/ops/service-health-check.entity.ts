import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'ops.service_health_checks' })
export class ServiceHealthCheck {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  serviceName!: string;

  @Property()
  status!: string;

  @Property({ type: 'integer', nullable: true })
  latencyMs?: number;

  @Property({ type: 'jsonb', default: '{}' })
  details!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  checkedAt!: Date;
}
