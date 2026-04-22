import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.predictions' })
@Unique({ properties: ['predictionRunId', 'stationId', 'target', 'predictedFor'] })
export class Prediction {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'PredictionRun',
    fieldName: 'prediction_run_id',
    onDelete: 'CASCADE',
    ref: true,
  })
  predictionRunId!: string;

  @ManyToOne({
    entity: () => 'ModelVersion',
    fieldName: 'model_version_id',
    onDelete: 'SET NULL',
    nullable: true,
    ref: true,
  })
  modelVersionId?: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property({ default: 'aqi' })
  target!: string;
  // prediction_target_enum: 'aqi', 'pm25', 'pm10', 'o3', 'no2', 'so2', 'co'

  @Property({ type: 'datetime' })
  predictedFor!: Date;

  @Property({ type: 'double precision', columnType: 'double precision' })
  predictedValue!: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  lowerBound?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  upperBound?: number;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  confidenceScore?: number;

  @ManyToOne({
    entity: () => 'FeatureSnapshot',
    fieldName: 'features_snapshot_id',
    onDelete: 'SET NULL',
    nullable: true,
    ref: true,
  })
  featuresSnapshotId?: string;

  @Property({ type: 'jsonb', default: '{}' })
  explanation!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
