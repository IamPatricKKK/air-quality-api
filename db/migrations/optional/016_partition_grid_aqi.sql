-- Migration 016 (OPTIONAL — PHASE 4 §6.2): Partition analytics.grid_aqi_observations theo tháng
--
-- ⚠️ KHÔNG được wire vào src/migrations/Migration00001_initial_schema.ts (cố ý
--    đặt trong db/migrations/optional/ để KHÔNG tự động chạy). Đây là thao tác
--    REWRITE bảng đã có dữ liệu → chỉ chạy THỦ CÔNG khi cần scale (theo plan
--    §6.2: ~2-6M rows/năm). Với quy mô đồ án (~701 điểm × vài lần/ngày) bảng
--    thường + index hiện tại là đủ; partition chỉ cần khi dữ liệu rất lớn.
--
-- Cách áp dụng thủ công (đã backup trước):
--   docker exec -i <pg> psql -U postgres -d sky_pulse < 016_partition_grid_aqi.sql
--
-- Chiến lược: RANGE partition theo observed_at, 1 partition / tháng, kèm
-- function tạo partition tương lai (gọi định kỳ hoặc trong cron bảo trì).

BEGIN;

-- 1) Đổi tên bảng cũ.
ALTER TABLE analytics.grid_aqi_observations
  RENAME TO grid_aqi_observations_legacy;

-- 2) Tạo bảng partitioned (PK phải gồm cột partition: observed_at — đã nằm trong PK gốc).
CREATE TABLE analytics.grid_aqi_observations (
  grid_point_id     UUID NOT NULL REFERENCES catalog.grid_points(id) ON DELETE CASCADE,
  observed_at       TIMESTAMPTZ NOT NULL,
  aqi               INTEGER,
  pm25              NUMERIC(8, 2),
  pm10              NUMERIC(8, 2),
  o3                NUMERIC(8, 2),
  no2               NUMERIC(8, 2),
  so2               NUMERIC(8, 2),
  co                NUMERIC(8, 2),
  source_code       TEXT NOT NULL,
  confidence_score  NUMERIC(3, 2),
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (grid_point_id, observed_at),
  CONSTRAINT chk_grid_aqi_confidence_range
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
) PARTITION BY RANGE (observed_at);

CREATE INDEX idx_grid_aqi_observed_at_desc
  ON analytics.grid_aqi_observations (observed_at DESC);
CREATE INDEX idx_grid_aqi_source_code
  ON analytics.grid_aqi_observations (source_code);
CREATE INDEX idx_grid_aqi_point_observed_at
  ON analytics.grid_aqi_observations (grid_point_id, observed_at DESC);

-- 3) Helper: tạo partition cho 1 tháng (idempotent).
CREATE OR REPLACE FUNCTION analytics.ensure_grid_aqi_partition(p_month DATE)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_d DATE := date_trunc('month', p_month);
  end_d   DATE := (date_trunc('month', p_month) + INTERVAL '1 month');
  part    TEXT := 'grid_aqi_observations_' || to_char(start_d, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS analytics.%I PARTITION OF analytics.grid_aqi_observations
       FOR VALUES FROM (%L) TO (%L)',
    part, start_d, end_d
  );
END;
$$;

-- 4) Tạo partition cho 3 tháng quanh hiện tại + backfill dữ liệu cũ.
SELECT analytics.ensure_grid_aqi_partition((now() - INTERVAL '1 month')::date);
SELECT analytics.ensure_grid_aqi_partition(now()::date);
SELECT analytics.ensure_grid_aqi_partition((now() + INTERVAL '1 month')::date);

-- Backfill: tạo partition cho mọi tháng có trong bảng legacy rồi copy.
DO $$
DECLARE m DATE;
BEGIN
  FOR m IN
    SELECT DISTINCT date_trunc('month', observed_at)::date
    FROM analytics.grid_aqi_observations_legacy
  LOOP
    PERFORM analytics.ensure_grid_aqi_partition(m);
  END LOOP;
END $$;

INSERT INTO analytics.grid_aqi_observations
SELECT * FROM analytics.grid_aqi_observations_legacy;

-- 5) Xoá bảng legacy sau khi xác nhận count khớp (bỏ comment khi chắc chắn).
-- DROP TABLE analytics.grid_aqi_observations_legacy;

COMMIT;
