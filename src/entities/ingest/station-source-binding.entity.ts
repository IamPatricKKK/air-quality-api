import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { Station } from '../catalog/station.entity';
import { SourceEndpoint } from './source-endpoint.entity';
import { User } from '../iam/user.entity';

@Entity({ tableName: 'ingest.station_source_bindings' })
@Unique({ properties: ['station', 'endpoint'] })
export class StationSourceBinding {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Station, { onDelete: 'CASCADE' })
  station!: Station;

  @ManyToOne(() => SourceEndpoint, { onDelete: 'CASCADE' })
  endpoint!: SourceEndpoint;

  @Property({ type: 'text' })
  externalObjectId!: string;

  @Property({ type: 'smallint', default: 100 })
  priority: number = 100;

  @Property({ type: 'boolean', default: true })
  isEnabled: boolean = true;

  @Property({ type: 'jsonb', default: '{}' })
  config: Record<string, any> = {};

  @Property({ type: 'timestamptz', nullable: true })
  validFrom?: Date;

  @Property({ type: 'timestamptz', nullable: true })
  validTo?: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  updatedByUser?: User;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
