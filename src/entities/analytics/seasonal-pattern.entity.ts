import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.seasonal_patterns' })
@Unique({ properties: ['stationId', 'metric', 'analysisDate'] })
export class SeasonalPattern {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', deleteRule: 'cascade', ref: true })
  stationId!: string;

  @Property({ default: 'aqi' })
  metric!: string;

  @Property({ type: 'date', defaultRaw: 'CURRENT_DATE' })
  analysisDate!: Date;

  @Property({ type: 'integer', default: 30 })
  periodDays!: number;

  @Property({ type: 'jsonb', nullable: true })
  hourlyProfile?: Record<string, any>;

  @Property({ type: 'jsonb', nullable: true })
  dailyProfile?: Record<string, any>;

  @Property({ columnType: 'integer[]', nullable: true })
  peakHours?: number[];

  @Property({ columnType: 'integer[]', nullable: true })
  offPeakHours?: number[];

  @Property({ type: 'integer', nullable: true })
  bestDow?: number;

  @Property({ type: 'integer', nullable: true })
  worstDow?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  overallAvg?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  hourlyVariation?: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
