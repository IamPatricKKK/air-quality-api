import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'forecast.model_versions' })
@Unique({ properties: ['modelId', 'version'] })
export class ModelVersion {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne({
    entity: () => 'ModelRegistry',
    fieldName: 'model_id',
    deleteRule: 'cascade',
    ref: true,
  })
  modelId!: string;

  @Property()
  version!: string;

  @Property({ nullable: true })
  artifactUri?: string;

  @Property({ nullable: true })
  trainingLibrary?: string;

  @Property({ type: 'jsonb', default: '{}' })
  hyperparameters!: Record<string, any>;

  @Property({ type: 'jsonb', default: '{}' })
  metrics!: Record<string, any>;

  @Property({ default: false })
  isProduction!: boolean;

  @Property({ type: 'datetime', nullable: true })
  releasedAt?: Date;

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  createdAt!: Date;
}
