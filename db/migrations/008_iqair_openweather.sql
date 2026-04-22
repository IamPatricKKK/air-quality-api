-- ============================================================
-- Migration 008: IQAir (AirVisual) + OpenWeatherMap providers
-- IQAir  → nguồn chính (priority 50)
-- OpenWeather → nguồn phụ (priority 150)
-- ============================================================

-- ---------- IQAir ----------

INSERT INTO ingest.source_providers (id, code, name, category, base_url, is_active, config)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'iqair',
  'IQAir (AirVisual)',
  'environmental',
  'https://api.airvisual.com',
  TRUE,
  '{"requires_token": true, "rate_limit_rpm": 5, "free_tier_monthly": 10000, "priority": "primary"}'::jsonb
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      config = EXCLUDED.config,
      is_active = TRUE;

INSERT INTO ingest.source_endpoints (id, source_provider_id, code, name, base_url, path, http_method, parser_key, is_active, config)
VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000003',
  'iqair_nearest_city',
  'IQAir Nearest City (realtime AQI + weather)',
  'https://api.airvisual.com',
  '/v2/nearest_city',
  'GET',
  'iqair.nearest_city.v2',
  TRUE,
  '{"response_format": "json"}'::jsonb
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      path = EXCLUDED.path,
      parser_key = EXCLUDED.parser_key,
      is_active = TRUE;

-- Bind IQAir cho tất cả stations đang active (priority 50 = cao nhất)
INSERT INTO ingest.station_source_bindings (station_id, source_provider_id, source_endpoint_id, is_enabled, priority, valid_from, config)
SELECT
  st.id,
  'a0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000004',
  TRUE,
  50,
  now(),
  '{}'::jsonb
FROM catalog.stations st
WHERE st.is_active = TRUE
ON CONFLICT (station_id, source_endpoint_id) DO NOTHING;

-- ---------- OpenWeatherMap ----------

INSERT INTO ingest.source_providers (id, code, name, category, base_url, is_active, config)
VALUES (
  'a0000000-0000-0000-0000-000000000004',
  'openweathermap',
  'OpenWeatherMap',
  'environmental',
  'https://api.openweathermap.org',
  TRUE,
  '{"requires_token": true, "free_tier_daily": 1000, "priority": "secondary"}'::jsonb
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      config = EXCLUDED.config,
      is_active = TRUE;

INSERT INTO ingest.source_endpoints (id, source_provider_id, code, name, base_url, path, http_method, parser_key, is_active, config)
VALUES
  (
    'b0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000004',
    'openweather_air_pollution',
    'OpenWeather Air Pollution (current)',
    'https://api.openweathermap.org',
    '/data/2.5/air_pollution',
    'GET',
    'openweather.air_pollution.v2_5',
    TRUE,
    '{"response_format": "json"}'::jsonb
  ),
  (
    'b0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000004',
    'openweather_current_weather',
    'OpenWeather Current Weather',
    'https://api.openweathermap.org',
    '/data/2.5/weather',
    'GET',
    'openweather.weather.v2_5',
    TRUE,
    '{"response_format": "json"}'::jsonb
  )
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      path = EXCLUDED.path,
      parser_key = EXCLUDED.parser_key,
      is_active = TRUE;

-- Bind OpenWeather cho tất cả stations active (priority 150)
INSERT INTO ingest.station_source_bindings (station_id, source_provider_id, source_endpoint_id, is_enabled, priority, valid_from, config)
SELECT
  st.id,
  'a0000000-0000-0000-0000-000000000004',
  ep.id,
  TRUE,
  150,
  now(),
  '{}'::jsonb
FROM catalog.stations st
CROSS JOIN (
  SELECT id FROM ingest.source_endpoints
  WHERE code IN ('openweather_air_pollution', 'openweather_current_weather')
) ep
WHERE st.is_active = TRUE
ON CONFLICT (station_id, source_endpoint_id) DO NOTHING;

-- ---------- Update fusion view: add IQAir as TOP priority ----------

CREATE OR REPLACE VIEW core.v_aq_observations_fused AS
WITH ranked AS (
  SELECT
    o.*,
    sp.code   AS provider_code,
    sp.name   AS provider_name,
    ROW_NUMBER() OVER (
      PARTITION BY o.station_id, date_trunc('hour', o.observed_at)
      ORDER BY
        -- Priority ordering: IQAir > WAQI > OpenWeather > Open-Meteo
        CASE sp.code
          WHEN 'iqair' THEN 1
          WHEN 'waqi' THEN 2
          WHEN 'openweathermap' THEN 3
          WHEN 'openmeteo' THEN 4
          ELSE 5
        END,
        o.fetched_at DESC NULLS LAST
    ) AS rn
  FROM core.air_quality_observations o
  JOIN ingest.source_providers sp ON sp.id = o.source_provider_id
)
SELECT
  id, station_id, source_provider_id, source_endpoint_id,
  pipeline_run_id, raw_payload_id, normalize_run_id,
  observed_at, aqi, pm25, pm10, o3, no2, so2, co,
  european_aqi, ammonia, dust, aerosol_optical_depth, uv_index,
  lineage, fetched_at, created_at,
  provider_code, provider_name
FROM ranked
WHERE rn = 1;
