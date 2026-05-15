import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.analysis_reports' })
export class AnalysisReport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'AnalysisRun',
    fieldName: 'analysis_run_id',
    deleteRule: 'cascade',
    ref: true,
  })
  analysisRunId!: string;

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

  @Property()
  reportType!: string;
  // analysis_type_enum: 'correlation', 'trend', 'seasonal', 'health_impact', etc.

  @Property()
  title!: string;

  @Property({ type: 'jsonb' })
  reportPayload!: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  generatedAt!: Date;
}
