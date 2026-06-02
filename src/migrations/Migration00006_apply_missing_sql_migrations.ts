import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Backfills the raw SQL migrations that Migration00001 never applied, so a
 * fresh production DB matches the structure the app code + Python BE expect.
 *
 * Files applied (idempotent — IF NOT EXISTS / ON CONFLICT):
 *   002 expand_ingest            — extra ingest columns
 *   005 waqi_provider            — WAQI provider/endpoints/bindings
 *   008 iqair_openweather        — IQAir + OpenWeather providers/endpoints/bindings
 *   009 extend_vn_stations       — more VN stations
 *   010 fix_bindings_columns     — align station_source_bindings (no-op if already correct)
 *   014 grid_points              — catalog.grid_points (BE grid ingest/fusion)
 *   015 grid_aqi_observations    — analytics.grid_aqi_observations
 *   018 areas_vn_2025            — VN administrative areas seed
 *   019 areas_vn_2025_centroids  — area centroids (BE ward fusion)
 */
export class Migration00006_apply_missing_sql_migrations extends Migration {
  override async up(): Promise<void> {
    const root = join(__dirname, '..', '..');
    const files = [
      'db/migrations/002_expand_ingest.sql',
      'db/migrations/005_waqi_provider.sql',
      'db/migrations/008_iqair_openweather.sql',
      'db/migrations/009_extend_vn_stations.sql',
      'db/migrations/010_fix_bindings_columns.sql',
      'db/migrations/014_grid_points.sql',
      'db/migrations/015_grid_aqi_observations.sql',
      'db/migrations/018_areas_vn_2025.sql',
      'db/migrations/019_areas_vn_2025_centroids.sql',
    ];
    for (const f of files) {
      this.addSql(readFileSync(join(root, f), 'utf-8'));
    }
  }

  override async down(): Promise<void> {
    // No-op: these are additive/idempotent seed + schema migrations.
  }
}
