import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Enum,
  Collection,
  Rel,
  Unique,
} from '@mikro-orm/core';
import { AreaLevel } from '../iam/enums';

@Entity({ tableName: 'catalog.areas' })
@Unique({
  properties: ['level', 'code'],
})
export class Area {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => Area,
    nullable: true,
    deleteRule: 'set null',
  })
  parent?: Rel<Area>;

  @Enum({
    items: () => AreaLevel,
  })
  level!: AreaLevel;

  @Property({ type: 'text' })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @Property({ type: 'integer', default: 0 })
  sortOrder: number = 0;

  @Property({ type: 'double', nullable: true })
  centerLat?: number;

  @Property({ type: 'double', nullable: true })
  centerLng?: number;

  @Property({
    type: 'jsonb',
    default: '{}',
  })
  metadata: Record<string, any> = {};

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  // Self-referencing relation for child areas
  @OneToMany({
    entity: () => Area,
    mappedBy: 'parent',
  })
  children = new Collection<Area>(this);
}
