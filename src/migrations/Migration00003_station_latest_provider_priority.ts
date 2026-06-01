import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Rebuilds app.v_station_latest_air_quality so the "current" reading per
 * station is chosen by provider trust priority (real monitoring stations
 * first: WAQI > IQAir > OpenWeather > Open-Meteo > OpenAQ) among fresh
 * readings, falling back to the newest reading of any provider otherwise.
 *
 * Applied SQL uses CREATE OR REPLACE VIEW (idempotent, identical columns).
 */
export class Migration00003_station_latest_provider_priority extends Migration {
  override async up(): Promise<void> {
    const root = join(__dirname, '..', '..');
    const sql = readFileSync(join(root, 'db/migrations/017_station_latest_provider_priority.sql'), 'utf-8');
    this.addSql(sql);
  }

  override async down(): Promise<void> {
    // Restore the previous behaviour: latest reading purely by timestamp.
    this.addSql(`
      CREATE OR REPLACE VIEW app.v_station_latest_air_quality AS
      SELECT
        s.id AS station_id,
        s.code AS station_code,
        s.name AS station_name,
        s.area_id,
        s.lat,
        s.lng,
        s.is_active,
        aq.observed_at,
        COALESCE(aq.fetched_at, weather.fetched_at) AS fetched_at,
        aq.aqi,
        aq.pm25,
        aq.pm10,
        aq.o3,
        aq.no2,
        aq.so2,
        aq.co,
        COALESCE(aq.temperature_c, weather.temperature_c) AS temperature_c,
        COALESCE(aq.humidity_pct, weather.humidity_pct) AS humidity_pct,
        COALESCE(aq.wind_speed_mps, weather.wind_speed_mps) AS wind_speed_mps,
        aq.quality_status,
        sp.code AS source_provider_code,
        se.code AS source_endpoint_code
      FROM catalog.stations s
      LEFT JOIN LATERAL (
        SELECT *
        FROM core.air_quality_observations a
        WHERE a.station_id = s.id
        ORDER BY a.observed_at DESC
        LIMIT 1
      ) aq ON TRUE
      LEFT JOIN LATERAL (
        SELECT *
        FROM core.weather_observations w
        WHERE w.station_id = s.id
        ORDER BY w.observed_at DESC
        LIMIT 1
      ) weather ON TRUE
      LEFT JOIN ingest.source_providers sp ON sp.id = aq.source_provider_id
      LEFT JOIN ingest.source_endpoints se ON se.id = aq.source_endpoint_id
      WHERE s.is_active = TRUE;
    `);
  }
}
