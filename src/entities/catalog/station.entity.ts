import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Enum,
  Rel,
} from '@mikro-orm/core';
import { StationType } from '../iam/enums';
import { Area } from './area.entity';

@Entity({ tableName: 'catalog.stations' })
export class Station {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ type: 'text', unique: true })
  code!: string;

  @Property({ type: 'text' })
  name!: string;

  @ManyToOne({
    entity: () => Area,
    nullable: true,
    deleteRule: 'set null',
  })
  area?: Rel<Area>;

  @Property({ type: 'text', nullable: true })
  address?: string;

  @Property({ type: 'double' })
  lat!: number;

  @Property({ type: 'double' })
  lng!: number;

  @Property({ type: 'double', nullable: true })
  elevationM?: number;

  @Enum({
    items: () => StationType,
    default: StationType.MONITORING,
  })
  stationType: StationType = StationType.MONITORING;

  @Property({ type: 'text', default: 'Asia/Ho_Chi_Minh' })
  timezone: string = 'Asia/Ho_Chi_Minh';

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true;

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
