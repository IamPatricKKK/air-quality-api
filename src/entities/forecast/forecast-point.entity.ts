import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.forecast_points' })
export class ForecastPoint {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'ForecastRun',
    fieldName: 'forecast_run_id',
    onDelete: 'CASCADE',
    ref: true,
  })
  forecastRunId!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property()
  targetMetric!: string;

  @Property({ type: 'datetime' })
  predictedAt!: Date;

  @Property({ columnType: 'numeric', precision: 8, scale: 2 })
  predictedValue!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  lowerBound?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  upperBound?: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
