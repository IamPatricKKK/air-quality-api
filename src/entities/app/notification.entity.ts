import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '../iam/user.entity';
import { NotificationTemplate } from './notification-template.entity';
import { Station } from '../catalog/station.entity';

@Entity({ tableName: 'app.notifications' })
export class Notification {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @ManyToOne(() => NotificationTemplate, { deleteRule: 'set null', nullable: true })
  template?: NotificationTemplate;

  @ManyToOne(() => Station, { deleteRule: 'set null', nullable: true })
  station?: Station;

  @Property({ type: 'text', default: 'system' })
  category: string = 'system';

  @Property({ type: 'text' })
  title!: string;

  @Property({ type: 'text' })
  body!: string;

  @Property({ type: 'text', default: 'pending' })
  status: string = 'pending';

  @Property({ type: 'jsonb', default: '{}' })
  sourceContext: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Property({ type: 'timestamptz', nullable: true })
  readAt?: Date;
}
