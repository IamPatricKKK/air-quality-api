import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'app.notification_templates' })
export class NotificationTemplate {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text', unique: true })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'text' })
  titleTemplate!: string;

  @Property({ type: 'text' })
  bodyTemplate!: string;

  @Property({ type: 'text[]', default: '{in_app}' })
  channels: string[] = ['in_app'];

  @Property({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any> = {};

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
