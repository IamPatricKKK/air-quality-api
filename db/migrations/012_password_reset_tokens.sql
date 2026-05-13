-- Migration 012: Password reset tokens
-- Stores time-limited tokens used to reset forgotten passwords.
-- A user can have multiple outstanding tokens but only the most recent
-- unused token is honored. Tokens expire after 1 hour by default.

CREATE TABLE IF NOT EXISTS iam.password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON iam.password_reset_tokens (user_id, created_at DESC);
