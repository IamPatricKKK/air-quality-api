import {
  Entity,
  PrimaryKey,
  Property,
  OneToOne,
  Rel,
} from '@mikro-orm/core';
import { User } from './user.entity';

@Entity({ tableName: 'iam.user_profiles' })
export class UserProfile {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @OneToOne({
    entity: () => User,
    unique: true,
    deleteRule: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text', nullable: true })
  displayName?: string;

  @Property({ type: 'text', nullable: true })
  avatarUrl?: string;

  @Property({ type: 'text', nullable: true })
  phone?: string;

  @Property({
    type: 'jsonb',
    default: '{}',
  })
  metadata: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
