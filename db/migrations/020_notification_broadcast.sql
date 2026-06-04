-- 020: Notification broadcast support + admin inbox + system config
-- Adds broadcast columns to notifications table and system_config for daily report settings.

-- Broadcast columns on existing notifications table
ALTER TABLE app.notifications
  ADD COLUMN IF NOT EXISTS target_type  TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS target_value TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_by      UUID REFERENCES iam.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_id     UUID;

-- Index for scheduled notification processor
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled
  ON app.notifications (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'scheduled';

-- Index for admin inbox queries (category + user + time)
CREATE INDEX IF NOT EXISTS idx_notifications_category_user
  ON app.notifications (user_id, category, created_at DESC);

-- System config key-value table
CREATE TABLE IF NOT EXISTS app.system_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app.system_config (key, value) VALUES
  ('daily_report', '{"enabled": true, "cron": "0 6 * * *"}')
ON CONFLICT DO NOTHING;
