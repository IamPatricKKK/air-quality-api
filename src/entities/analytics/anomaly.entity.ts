import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.anomalies' })
export class Anomaly {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', deleteRule: 'cascade', ref: true })
  stationId!: string;

  @Property()
  metric!: string;

  @Property({ type: 'datetime' })
  detectedAt!: Date;

  @Property({ columnType: 'numeric' })
  value!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 3, nullable: true })
  zScore?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 3, nullable: true })
  iqrFactor?: number;

  @Property({ default: 'zscore' })
  method!: string;

  @Property({ default: 'warning' })
  severity!: string;

  @Property({ nullable: true })
  description?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
