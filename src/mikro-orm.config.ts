import { defineConfig } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { Migrator } from '@mikro-orm/migrations';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sky_pulse',

  // Entity discovery
  entities: ['./dist/entities/**/*.entity.js'],
  entitiesTs: ['./src/entities/**/*.entity.ts'],
  metadataProvider: TsMorphMetadataProvider,

  // Migrations
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    // Migration tracking table in ops schema
    tableName: 'mikro_orm_migrations',
    schemaName: 'ops',
    transactional: true,
    allOrNothing: true,
    glob: '!(*.d).{js,ts}',
    // Use SQL migrations so we can include existing .sql files
    emit: 'ts',
  },

  // Ensure schemas exist before running migrations
  schemaGenerator: {
    createForeignKeyConstraints: true,
  },

  // Debug in dev
  debug: process.env.NODE_ENV !== 'production',

  // Connection pool
  pool: { min: 2, max: 10 },

  // Allow global context (for NestJS request-scoped usage)
  allowGlobalContext: true,
});
