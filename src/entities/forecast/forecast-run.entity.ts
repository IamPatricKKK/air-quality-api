import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.forecast_runs' })
export class ForecastRun {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property({ default: 'prophet' })
  modelType!: string;

  @Property({ default: 'aqi' })
  targetMetric!: string;

  @Property({ type: 'integer', default: 24 })
  horizonHours!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 3, nullable: true })
  mae?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 3, nullable: true })
  rmse?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 3, nullable: true })
  mape?: number;

  @Property({ type: 'integer', nullable: true })
  trainingRows?: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  startedAt!: Date;

  @Property({ type: 'datetime', nullable: true })
  finishedAt?: Date;

  @Property({ default: 'running' })
  status!: string;

  @Property({ nullable: true })
  errorMessage?: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
