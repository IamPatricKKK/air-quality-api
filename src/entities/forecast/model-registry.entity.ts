import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.model_registry' })
export class ModelRegistry {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ unique: true })
  code!: string;

  @Property()
  name!: string;

  @Property()
  target!: string;
  // prediction_target_enum: 'aqi', 'pm25', 'pm10', 'o3', 'no2', 'so2', 'co'

  @ManyToOne({
    entity: () => 'Station',
    fieldName: 'station_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  stationId?: string;

  @ManyToOne({
    entity: () => 'Area',
    fieldName: 'area_id',
    deleteRule: 'cascade',
    nullable: true,
    ref: true,
  })
  areaId?: string;

  @Property({ default: 'be_data' })
  ownerService!: string;

  @Property({ default: 'draft' })
  status!: string;
  // model_status_enum: 'draft', 'testing', 'production', 'deprecated'

  @Property({ type: 'integer', default: 48 })
  horizonHours!: number;

  @Property({ nullable: true })
  featureSetVersion?: string;

  @Property({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  updatedAt!: Date;
}
