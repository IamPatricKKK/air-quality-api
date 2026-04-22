import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Initial migration — applies the base schema when needed, then layers the
 * compatible supplemental SQL that the current app still expects.
 *
 * Files applied (in order):
 *   db/schema.sql                  — base tables, enums, views, seed data
 *   db/migrations/001_*.sql        — analytics views used by the API
 *   db/migrations/003_*.sql        — alert tables layered on top of schema.sql
 *   db/migrations/004_*.sql        — extra analytics/forecast persistence tables
 *   db/migrations/007_*.sql        — bootstrap VN areas/stations
 *
 * Legacy SQL files 002/005/006 are intentionally excluded here because they
 * target an older schema shape or are missing from the repo.
 */
export class Migration00001_initial_schema extends Migration {
  override async up(): Promise<void> {
    const root = join(__dirname, '..', '..');
    const [{ schemaBootstrapped }] = await this.execute(`
      select exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'iam'
          and c.relname = 'users'
          and c.relkind = 'r'
      ) as "schemaBootstrapped"
    `) as Array<{ schemaBootstrapped: boolean }>;

    const files = [
      // seed.bootstrap.sql removed — DB starts clean, real data comes from external API ingestion
      'db/migrations/001_station_analytics.sql',
      'db/migrations/003_alerts_system.sql',
      'db/migrations/004_analytics_ml.sql',
      'db/migrations/007_bootstrap_stations.sql',
    ];

    if (!schemaBootstrapped) {
      files.unshift('db/schema.sql');
    }

    for (const file of files) {
      const path = join(root, file);
      const sql = readFileSync(path, 'utf-8');
      this.addSql(sql);
    }
  }

  override async down(): Promise<void> {
    // Reverse order: drop schemas
    this.addSql('DROP SCHEMA IF EXISTS ops CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS forecast CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS analytics CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS core CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS ingest CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS app CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS catalog CASCADE');
    this.addSql('DROP SCHEMA IF EXISTS iam CASCADE');
  }
}
