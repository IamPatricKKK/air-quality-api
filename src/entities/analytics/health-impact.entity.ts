import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';

@Entity({ tableName: 'analytics.health_impacts' })
export class HealthImpact {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'Station',
    fieldName: 'station_id',
    onDelete: 'CASCADE',
    unique: true,
    ref: true,
  })
  stationId!: string;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  analysisTime!: Date;

  @Property({ type: 'integer', default: 48 })
  periodHours!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2, nullable: true })
  currentAqi?: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2 })
  avgAqi!: number;

  @Property({ columnType: 'numeric', precision: 8, scale: 2 })
  maxAqi!: number;

  @Property()
  currentLevel!: string;

  @Property()
  avgLevel!: string;

  @Property()
  riskLevel!: string;

  @Property({ columnType: 'numeric', precision: 5, scale: 1 })
  exposureScore!: number;

  @Property()
  dominantPollutant!: string;

  @Property({ type: 'jsonb', nullable: true })
  timeInLevels?: Record<string, any>;

  @Property({ nullable: true })
  adviceVi?: string;

  @Property({ nullable: true })
  adviceEn?: string;

  @Property({ type: 'jsonb', nullable: true })
  pollutantAverages?: Record<string, any>;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
