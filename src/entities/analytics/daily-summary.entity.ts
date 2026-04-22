import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.daily_summaries' })
@Unique({ properties: ['stationId', 'summaryDate'] })
export class DailySummary {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property({ type: 'date' })
  summaryDate!: Date;

  @Property({ type: 'integer', default: 0 })
  samples!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  aqiAvg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  aqiMin?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  aqiMax?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  aqiStddev?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  pm25Avg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  pm10Avg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  o3Avg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  no2Avg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  so2Avg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  coAvg?: number;

  @Property({ columnType: 'numeric', precision: 6, scale: 2, nullable: true })
  tempAvg?: number;

  @Property({ columnType: 'numeric', precision: 6, scale: 2, nullable: true })
  humidityAvg?: number;

  @Property({ columnType: 'numeric', precision: 6, scale: 2, nullable: true })
  windAvg?: number;

  @Property({ nullable: true })
  category?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
