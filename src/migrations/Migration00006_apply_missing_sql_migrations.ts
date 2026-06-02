import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Backfills the raw SQL migrations that Migration00001 never applied, so a
 * fresh production DB matches the structure the app code + Python BE expect.
 *
 * Only files that match the CURRENT db/schema.sql shape are applied. The
 * provider/endpoint/binding seeds (005/008) and the column/seed file 002 are
 * deliberately omitted — see "Excluded" below.
 *
 * Files applied (all idempotent — CREATE…IF NOT EXISTS / ON CONFLICT DO NOTHING):
 *   009 extend_vn_stations       — more VN province stations (level/code DDD model)
 *   010 fix_bindings_columns     — align station_source_bindings (no-op if already correct)
 *   014 grid_points              — catalog.grid_points (BE grid ingest/fusion)
 *   015 grid_aqi_observations    — analytics.grid_aqi_observations
 *   018 areas_vn_2025            — VN ward/province administrative areas seed
 *   019 areas_vn_2025_centroids  — area centroids (BE ward fusion)
 *
 * Excluded (target an OLD schema shape — would fail on the current schema.sql DB):
 *   002 expand_ingest      — its observation columns already exist in schema.sql,
 *                            and its area/station INSERTs use a legacy `region`
 *                            column the current DDD schema (level/code) never had.
 *   005 waqi_provider      — insert into ingest.source_endpoints with
 *   008 iqair_openweather    source_provider_id/base_url and no `kind`; the live
 *                            table uses provider_id + kind (NOT NULL) + no base_url.
 *                            Not needed: IngestService.ensureProviderAndEndpoints()
 *                            creates every provider/endpoint/binding at runtime
 *                            against the correct schema.
 */
export class Migration00006_apply_missing_sql_migrations extends Migration {
  override async up(): Promise<void> {
    const root = join(__dirname, '..', '..');
    const files = [
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
