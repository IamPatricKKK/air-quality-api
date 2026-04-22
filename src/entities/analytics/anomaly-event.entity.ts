import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.anomaly_events' })
export class AnomalyEvent {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'AnalysisRun',
    fieldName: 'analysis_run_id',
    onDelete: 'CASCADE',
    ref: true,
  })
  analysisRunId!: string;

  @ManyToOne({
    entity: () => 'Station',
    fieldName: 'station_id',
    onDelete: 'CASCADE',
    nullable: true,
    ref: true,
  })
  stationId?: string;

  @Property({ type: 'datetime' })
  detectedAt!: Date;

  @Property()
  metricCode!: string;

  @Property({ type: 'double precision', nullable: true, columnType: 'double precision' })
  metricValue?: number;

  @Property({ type: 'smallint' })
  severity!: number;
  // 1-5 scale

  @Property({ nullable: true })
  reason?: string;

  @Property({ type: 'jsonb', default: '{}' })
  context!: Record<string, any>;

  @Property({ default: 'open' })
  status!: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
