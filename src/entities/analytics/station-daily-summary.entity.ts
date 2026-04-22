import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.station_daily_summaries' })
@Unique({ properties: ['stationId', 'summaryDate'] })
export class StationDailySummary {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'AnalysisRun',
    fieldName: 'analysis_run_id',
    onDelete: 'CASCADE',
    ref: true,
  })
  analysisRunId!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', onDelete: 'CASCADE', ref: true })
  stationId!: string;

  @Property({ type: 'date' })
  summaryDate!: Date;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  avgAqi?: number;

  @Property({ type: 'integer', nullable: true })
  maxAqi?: number;

  @Property({ type: 'integer', nullable: true })
  minAqi?: number;

  @Property({ nullable: true })
  dominantPollutant?: string;

  @Property({ type: 'integer', nullable: true })
  unhealthyHours?: number;

  @Property({ type: 'jsonb', default: '{}' })
  metrics!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
