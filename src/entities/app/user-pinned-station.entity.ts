import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { User } from '../iam/user.entity';
import { Station } from '../catalog/station.entity';

@Entity({ tableName: 'app.user_pinned_stations' })
@Unique({ properties: ['user', 'station'] })
export class UserPinnedStation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @ManyToOne(() => Station, { deleteRule: 'cascade' })
  station!: Station;

  @Property({ type: 'int', default: 0 })
  sortOrder: number = 0;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();
}
