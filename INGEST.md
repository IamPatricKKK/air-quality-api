# Ingest Open-Meteo — air-quality-api

Repo này chịu trách nhiệm thu thập dữ liệu thật từ Open-Meteo và ghi xuống Postgres.

## Luồng

1. `@nestjs/schedule` chạy cron `INGEST_CRON` (mặc định `0 */12 * * *` — mỗi 12 giờ).
2. Với mỗi `catalog.stations.is_active = TRUE`:
   - Gọi `air-quality-api.open-meteo.com/v1/air-quality` (past_hours = `OPENMETEO_PAST_HOURS`, mặc định 24).
   - Gọi `api.open-meteo.com/v1/forecast` cho dữ liệu thời tiết kèm.
3. Ghi vết vào `ingest.pipeline_runs → ingest.outbound_requests → ingest.raw_payloads → ingest.normalize_runs`.
4. Chuẩn hoá vào `core.air_quality_observations` và `core.weather_observations` (UPSERT theo `station_id + observed_at + source_endpoint_id`).
5. View `app.v_station_latest_air_quality` và `app.v_station_analytics` phục vụ FE/Admin đọc dữ liệu đã phân tích.

## Các trường lấy được

Air quality (hourly): `us_aqi`, `european_aqi`, `pm2_5`, `pm10`, `carbon_monoxide`, `nitrogen_dioxide`, `sulphur_dioxide`, `ozone`, `ammonia`, `dust`, `aerosol_optical_depth`, `uv_index`.

Weather (hourly): `temperature_2m`, `apparent_temperature`, `dew_point_2m`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `wind_gusts_10m`, `pressure_msl`, `surface_pressure`, `visibility`, `precipitation`, `rain`, `cloud_cover`, `weather_code`.

## Điều khiển

- `POST /api/v1/ingest/run` (Admin JWT) — chạy thủ công.
- `GET  /api/v1/ingest/status` (Admin JWT) — xem 20 run gần nhất.
- Endpoint cũ `/api/v1/ops/live-sync` ở `air-quality-be` trả 410 Gone → client gọi endpoint trên.

## Migration cần chạy trước lần đầu

```
psql $DATABASE_URL -f db/migrations/001_station_analytics.sql
psql $DATABASE_URL -f db/migrations/002_expand_ingest.sql
```
