-- Migration 013: Quiet hours for push notifications
-- Lets users configure a daily quiet window during which push alerts are suppressed
-- (e.g. 22:00 → 07:00). Stored as INT minutes from midnight to avoid timezone confusion;
-- the user's preferred timezone is read separately.

ALTER TABLE app.user_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start_min SMALLINT NOT NULL DEFAULT 1320,  -- 22:00
  ADD COLUMN IF NOT EXISTS quiet_hours_end_min   SMALLINT NOT NULL DEFAULT 420,   -- 07:00
  ADD CONSTRAINT quiet_hours_start_range CHECK (quiet_hours_start_min BETWEEN 0 AND 1439),
  ADD CONSTRAINT quiet_hours_end_range   CHECK (quiet_hours_end_min   BETWEEN 0 AND 1439);
