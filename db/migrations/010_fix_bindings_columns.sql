-- ============================================================
-- Migration 010: Sửa schema ingest.station_source_bindings cho khớp code
--
-- Trong schema.sql gốc bảng này dùng:
--   endpoint_id UUID (NOT NULL)
--   external_object_id TEXT NOT NULL
--   UNIQUE (station_id, endpoint_id)
--
-- Nhưng tất cả code ingest (NestJS) và migrations 005/008 chèn với:
--   source_provider_id UUID
--   source_endpoint_id UUID
--   external_object_id (không cung cấp → NOT NULL vi phạm)
--   ON CONFLICT (station_id, source_endpoint_id)
--
-- Migration này đưa schema về đúng cấu trúc code đang dùng, idempotent.
-- Nếu bạn đang dùng DB fresh docker mới tạo sau khi schema.sql đã update,
-- migration này là no-op.
-- ============================================================

DO $$
DECLARE
  has_endpoint_id         BOOLEAN;
  has_source_endpoint_id  BOOLEAN;
  has_source_provider_id  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ingest' AND table_name='station_source_bindings'
      AND column_name='endpoint_id'
  ) INTO has_endpoint_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ingest' AND table_name='station_source_bindings'
      AND column_name='source_endpoint_id'
  ) INTO has_source_endpoint_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ingest' AND table_name='station_source_bindings'
      AND column_name='source_provider_id'
  ) INTO has_source_provider_id;

  -- 1) endpoint_id → source_endpoint_id (rename)
  IF has_endpoint_id AND NOT has_source_endpoint_id THEN
    ALTER TABLE ingest.station_source_bindings
      RENAME COLUMN endpoint_id TO source_endpoint_id;
    RAISE NOTICE 'Renamed endpoint_id -> source_endpoint_id';
  END IF;

  -- 2) Thêm source_provider_id (populate từ endpoint.provider_id)
  IF NOT has_source_provider_id THEN
    ALTER TABLE ingest.station_source_bindings
      ADD COLUMN source_provider_id UUID
        REFERENCES ingest.source_providers(id) ON DELETE CASCADE;

    UPDATE ingest.station_source_bindings ssb
       SET source_provider_id = se.provider_id
      FROM ingest.source_endpoints se
     WHERE se.id = ssb.source_endpoint_id
       AND ssb.source_provider_id IS NULL;

    ALTER TABLE ingest.station_source_bindings
      ALTER COLUMN source_provider_id SET NOT NULL;

    RAISE NOTICE 'Added source_provider_id column and backfilled';
  END IF;

  -- 3) external_object_id NOT NULL → nullable with default ''
  ALTER TABLE ingest.station_source_bindings
    ALTER COLUMN external_object_id SET DEFAULT '';

  UPDATE ingest.station_source_bindings
     SET external_object_id = ''
   WHERE external_object_id IS NULL;

  -- NOT NULL vẫn giữ, nhưng giờ có DEFAULT '' nên INSERT không cung cấp được OK
END $$;

-- 4) Unique constraint: nếu constraint cũ theo endpoint_id, drop + recreate
ALTER TABLE ingest.station_source_bindings
  DROP CONSTRAINT IF EXISTS station_source_bindings_station_id_endpoint_id_key;

-- Tạo unique mới theo source_endpoint_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='ingest'
      AND table_name='station_source_bindings'
      AND constraint_type='UNIQUE'
      AND constraint_name='station_source_bindings_station_id_source_endpoint_id_key'
  ) THEN
    ALTER TABLE ingest.station_source_bindings
      ADD CONSTRAINT station_source_bindings_station_id_source_endpoint_id_key
      UNIQUE (station_id, source_endpoint_id);
  END IF;
END $$;

-- 5) Update views/indexes nếu còn reference endpoint_id cũ
DROP VIEW IF EXISTS ops.v_station_bindings_detail CASCADE;
-- View sẽ được recreate bởi schema.sql nếu user drop-recreate DB.
