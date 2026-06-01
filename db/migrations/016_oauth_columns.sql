-- 016_oauth_columns.sql
-- Add OAuth (Google/Facebook) identity columns to iam.users.
-- Idempotent: safe to run on fresh or already-bootstrapped databases.

ALTER TABLE iam.users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS google_id     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS facebook_id   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_url    VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iam_users_google_id
  ON iam.users (google_id) WHERE google_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iam_users_facebook_id
  ON iam.users (facebook_id) WHERE facebook_id IS NOT NULL;
