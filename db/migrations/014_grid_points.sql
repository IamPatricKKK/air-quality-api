-- Migration 014: Catalog grid points cho phủ AQI toàn Việt Nam
--
-- Mục đích: Hệ thống chỉ có ~7-40 trạm thật, không đủ phủ AQI cho toàn lãnh thổ
-- Việt Nam. Bảng catalog.grid_points lưu các điểm grid 0.2° (~22 km) phủ toàn
-- quốc (~700 điểm) để query AQI từ Open-Meteo (CAMS model) và hiển thị heatmap
-- cho các khu vực không có trạm vật lý — như Nha Trang, Tây Nguyên, ĐBSCL.
--
-- Schema: catalog (do air-quality-api quản lý).
-- Bảng dữ liệu AQI per grid point sẽ ở schema analytics, được air-quality-be
-- quản lý qua Alembic (xem migration tương ứng trong air-quality-be).

CREATE TABLE IF NOT EXISTS catalog.grid_points (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat             NUMERIC(8, 5) NOT NULL,
  lng             NUMERIC(8, 5) NOT NULL,
  province_code   TEXT,
  province_name   TEXT,
  district_code   TEXT,
  district_name   TEXT,
  is_land         BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_grid_points_lat_lng UNIQUE (lat, lng),
  CONSTRAINT chk_grid_lat_range CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT chk_grid_lng_range CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_grid_points_active
  ON catalog.grid_points (is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_grid_points_province
  ON catalog.grid_points (province_code);

CREATE INDEX IF NOT EXISTS idx_grid_points_geom
  ON catalog.grid_points USING GIST (point(lng, lat));

CREATE TRIGGER trg_catalog_grid_points_updated_at
BEFORE UPDATE ON catalog.grid_points
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
