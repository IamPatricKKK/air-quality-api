import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Rel,
  Unique,
} from '@mikro-orm/core';
import { User } from './user.entity';
import { Role } from './role.entity';

@Entity({ tableName: 'iam.user_roles', schema: 'iam' })
@Unique({
  properties: ['user', 'role'],
})
export class UserRole {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => User,
    onDelete: 'cascade',
  })
  user!: Rel<User>;

  @ManyToOne({
    entity: () => Role,
    onDelete: 'cascade',
  })
  role!: Rel<Role>;

  @ManyToOne({
    entity: () => User,
    nullable: true,
    onDelete: 'set null',
  })
  assignedBy?: Rel<User>;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  assignedAt: Date = new Date();
}
