-- 017_station_latest_provider_priority.sql
-- Make app.v_station_latest_air_quality pick the displayed reading by
-- provider trust priority (real monitoring stations first) instead of
-- purely by newest timestamp.
--
-- Priority among readings that are still fresh (<=6h):
--   waqi (1) > iqair (2) > openweathermap (3) > openmeteo (4) > openaq (5)
-- If nothing is fresh, fall back to the newest reading of any provider
-- so a station never renders blank.
--
-- Idempotent: CREATE OR REPLACE keeps the exact same output columns.

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
  SELECT a.*
  FROM core.air_quality_observations a
  LEFT JOIN ingest.source_providers spp ON spp.id = a.source_provider_id
  WHERE a.station_id = s.id
  ORDER BY
    (a.observed_at >= now() - INTERVAL '6 hours') DESC,
    (CASE
       WHEN a.observed_at >= now() - INTERVAL '6 hours' THEN
         CASE spp.code
           WHEN 'waqi'           THEN 1
           WHEN 'iqair'          THEN 2
           WHEN 'openweathermap' THEN 3
           WHEN 'openmeteo'      THEN 4
           WHEN 'openaq'         THEN 5
           ELSE 9
         END
       ELSE 0
     END) ASC,
    a.observed_at DESC
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
