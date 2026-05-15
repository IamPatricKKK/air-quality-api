import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Notification } from './notification.entity';

@Entity({ tableName: 'app.notification_deliveries' })
@Unique({ properties: ['notification', 'channel'] })
export class NotificationDelivery {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Notification, { deleteRule: 'cascade' })
  notification!: Notification;

  @Property({ type: 'text' })
  channel!: string;

  @Property({ type: 'text' })
  deliveryStatus!: string;

  @Property({ type: 'jsonb', default: '{}' })
  providerResponse: Record<string, any> = {};

  @Property({ type: 'timestamptz', nullable: true })
  lastAttemptAt?: Date;

  @Property({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;
}
