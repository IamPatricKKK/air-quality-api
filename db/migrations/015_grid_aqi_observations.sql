-- Migration 015: Analytics — AQI observations cho grid points
--
-- Bảng lưu kết quả AQI tại từng grid point qua thời gian. Cron job trong
-- air-quality-be sẽ fetch Open-Meteo cho mỗi grid_point trong catalog.grid_points
-- mỗi 3 giờ, upsert vào bảng này.
--
-- Lưu ý ownership: Mặc dù về mặt nghiệp vụ schema "analytics" thuộc về
-- air-quality-be (theo báo cáo mục 4.7.3), thực tế migration đang được quản lý
-- tập trung qua air-quality-api/db/migrations/ để giữ consistency với pattern
-- hiện tại (Alembic trong be repo chưa có version nào). Trong tương lai có thể
-- chuyển sang Alembic nếu muốn tách hoàn toàn.
--
-- source_code values:
--   'openmeteo'        — CAMS model qua Open-Meteo API (modeled data)
--   'idw_interpolated' — IDW từ các trạm thật gần đó (Phase 2)
--   'ml_predicted'     — ML model predict (Phase 3)
--   'fused'            — Multi-source weighted average (Phase 2+)

CREATE TABLE IF NOT EXISTS analytics.grid_aqi_observations (
  grid_point_id     UUID NOT NULL REFERENCES catalog.grid_points(id) ON DELETE CASCADE,
  observed_at       TIMESTAMPTZ NOT NULL,
  aqi               INT,
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
);

-- Index quan trọng nhất: query "latest" theo observed_at giảm dần.
CREATE INDEX IF NOT EXISTS idx_grid_aqi_observed_at_desc
  ON analytics.grid_aqi_observations (observed_at DESC);

-- Index để filter theo nguồn dữ liệu (debugging, analytics).
CREATE INDEX IF NOT EXISTS idx_grid_aqi_source_code
  ON analytics.grid_aqi_observations (source_code);

-- Index để query "AQI mới nhất cho mỗi grid_point trong 1 vùng".
CREATE INDEX IF NOT EXISTS idx_grid_aqi_point_observed_at
  ON analytics.grid_aqi_observations (grid_point_id, observed_at DESC);
