import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { User } from '../iam/user.entity';

@Entity({ tableName: 'app.user_preferences' })
export class UserPreference {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', unique: true })
  user!: User;

  @Property({ type: 'text', default: 'all' })
  notificationMode: string = 'all';

  @Property({ type: 'text[]', default: '{}' })
  favoriteRegions: string[] = [];

  @Property({ type: 'boolean', default: true })
  pushEnabled: boolean = true;

  @Property({ type: 'boolean', default: true })
  emailEnabled: boolean = true;

  @Property({ type: 'boolean', default: true })
  dailyReportEnabled: boolean = true;

  @Property({ type: 'double', nullable: true })
  locationLat?: number;

  @Property({ type: 'double', nullable: true })
  locationLng?: number;

  @Property({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
