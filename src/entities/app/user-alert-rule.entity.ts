import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from '../iam/user.entity';
import { Station } from '../catalog/station.entity';

@Entity({ tableName: 'app.user_alert_rules' })
export class UserAlertRule {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Station, { onDelete: 'CASCADE', nullable: true })
  station?: Station;

  @Property({ type: 'text' })
  metricCode!: string;

  @Property({ type: 'text', default: '>=' })
  operator: string = '>=';

  @Property({ type: 'double' })
  thresholdValue!: number;

  @Property({ type: 'text[]', default: '{in_app,email}' })
  channels: string[] = ['in_app', 'email'];

  @Property({ type: 'int', default: 60 })
  cooldownMinutes: number = 60;

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

  @Property({ type: 'jsonb', default: '{}' })
  context: Record<string, any> = {};

  @Property({ type: 'timestamptz', nullable: true })
  lastTriggeredAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
