import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'ops.audit_logs' })
export class AuditLog {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property()
  actorType!: string;
  // actor_type_enum: 'user', 'service', 'system'

  @ManyToOne({
    entity: () => 'User',
    fieldName: 'actor_user_id',
    deleteRule: 'set null',
    nullable: true,
    ref: true,
  })
  actorUserId?: string;

  @Property({ nullable: true })
  actorService?: string;

  @Property({ nullable: true })
  targetService?: string;

  @Property()
  action!: string;

  @Property()
  resourceType!: string;

  @Property({ type: 'uuid', nullable: true })
  resourceId?: string;

  @Property({ type: 'jsonb', default: '{}' })
  beforeData!: Record<string, any>;

  @Property({ type: 'jsonb', default: '{}' })
  afterData!: Record<string, any>;

  @Property({ type: 'jsonb', default: '{}' })
  context!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
