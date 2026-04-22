import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Rel,
} from '@mikro-orm/core';
import { User } from './user.entity';

@Entity({ tableName: 'iam.refresh_sessions', schema: 'iam' })
export class RefreshSession {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => User,
    onDelete: 'cascade',
  })
  user!: Rel<User>;

  @Property({ type: 'text', unique: true })
  refreshTokenHash!: string;

  @Property({
    type: 'text',
    columnType: 'inet',
    nullable: true,
  })
  ipAddress?: string;

  @Property({ type: 'text', nullable: true })
  userAgent?: string;

  @Property({ type: 'timestamptz' })
  expiresAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
