import {
  Entity,
  PrimaryKey,
  Property,
  OneToOne,
  OneToMany,
  Enum,
  Collection,
} from '@mikro-orm/core';
import { UserStatus } from './enums';
import { UserProfile } from './user-profile.entity';
import { UserRole } from './user-role.entity';
import { RefreshSession } from './refresh-session.entity';

@Entity({ tableName: 'iam.users' })
export class User {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({
    type: 'text',
    unique: true,
    columnType: 'citext',
  })
  email!: string;

  @Property({ type: 'text' })
  passwordHash!: string;

  @Enum({
    items: () => UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus = UserStatus.ACTIVE;

  @Property({ type: 'string', length: 20, default: 'local' })
  authProvider = 'local';

  @Property({ type: 'string', length: 100, nullable: true })
  googleId?: string;

  @Property({ type: 'string', length: 100, nullable: true })
  facebookId?: string;

  @Property({ type: 'string', length: 500, nullable: true })
  avatarUrl?: string;

  @Property({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  // Relations
  @OneToOne({
    entity: () => UserProfile,
    mappedBy: 'user',
    nullable: true,
    orphanRemoval: true,
  })
  profile?: UserProfile;

  @OneToMany({
    entity: () => UserRole,
    mappedBy: 'user',
    orphanRemoval: true,
  })
  roles = new Collection<UserRole>(this);

  @OneToMany({
    entity: () => RefreshSession,
    mappedBy: 'user',
    orphanRemoval: true,
  })
  refreshSessions = new Collection<RefreshSession>(this);
}
