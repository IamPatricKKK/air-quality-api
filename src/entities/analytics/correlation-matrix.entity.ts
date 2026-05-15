import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.correlation_matrices' })
@Unique({ properties: ['stationId', 'analysisDate'] })
export class CorrelationMatrix {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({ entity: () => 'Station', fieldName: 'station_id', deleteRule: 'cascade', ref: true })
  stationId!: string;

  @Property({ type: 'date', defaultRaw: 'CURRENT_DATE' })
  analysisDate!: Date;

  @Property({ type: 'integer', default: 30 })
  periodDays!: number;

  @Property({ type: 'jsonb' })
  correlations!: Record<string, any>;

  @Property({ type: 'integer', nullable: true })
  sampleSize?: number;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
