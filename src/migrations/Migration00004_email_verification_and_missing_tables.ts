import { Migration } from '@mikro-orm/migrations';

/**
 * Backfills tables/columns whose raw SQL files (db/migrations/011-013) were
 * never applied to existing databases, and adds the email verification
 * primitives needed for the new register-by-email flow.
 *
 * 1. iam.password_reset_tokens         — required by PasswordResetService
 * 2. app.push_subscriptions            — required by PushService
 * 3. app.user_preferences.quiet_hours_*— required by quiet-hours feature
 * 4. iam.users.email_verified_at +
 *    iam.email_verification_tokens     — required by email verification flow
 *
 * All statements use IF NOT EXISTS so this migration is safe on databases
 * where partial fixes were applied manually.
 */
export class Migration00004_email_verification_and_missing_tables extends Migration {
  override async up(): Promise<void> {
    // 1. Password reset tokens (was 012_password_reset_tokens.sql)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS iam.password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT password_reset_tokens_token_hash_unique UNIQUE (token_hash)
      );
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
        ON iam.password_reset_tokens (user_id, created_at DESC);
    `);

    // 2. Push subscriptions (was 011_push_subscriptions.sql)
    this.addSql(`
      CREATE TABLE IF NOT EXISTS app.push_subscriptions (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
        endpoint     TEXT NOT NULL,
        p256dh       TEXT NOT NULL,
        auth         TEXT NOT NULL,
        user_agent   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ,
        CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
      );
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
        ON app.push_subscriptions (user_id);
    `);

    // 3. Quiet hours columns on user_preferences (was 013_quiet_hours.sql)
    this.addSql(`
      ALTER TABLE app.user_preferences
        ADD COLUMN IF NOT EXISTS quiet_hours_enabled   BOOLEAN  NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quiet_hours_start_min SMALLINT NOT NULL DEFAULT 1320,
        ADD COLUMN IF NOT EXISTS quiet_hours_end_min   SMALLINT NOT NULL DEFAULT 420;
    `);
    // Add CHECK constraints separately so re-running is safe (ADD CONSTRAINT
    // has no IF NOT EXISTS clause; we guard with a DO block).
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'quiet_hours_start_range'
            AND conrelid = 'app.user_preferences'::regclass
        ) THEN
          ALTER TABLE app.user_preferences
            ADD CONSTRAINT quiet_hours_start_range
            CHECK (quiet_hours_start_min BETWEEN 0 AND 1439);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'quiet_hours_end_range'
            AND conrelid = 'app.user_preferences'::regclass
        ) THEN
          ALTER TABLE app.user_preferences
            ADD CONSTRAINT quiet_hours_end_range
            CHECK (quiet_hours_end_min BETWEEN 0 AND 1439);
        END IF;
      END$$;
    `);

    // 4. Email verification — verified-at column on users + tokens table
    this.addSql(`
      ALTER TABLE iam.users
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
    `);
    this.addSql(`
      CREATE TABLE IF NOT EXISTS iam.email_verification_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT email_verification_tokens_token_hash_unique UNIQUE (token_hash)
      );
    `);
    this.addSql(`
      CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
        ON iam.email_verification_tokens (user_id, created_at DESC);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS iam.idx_email_verification_tokens_user;`);
    this.addSql(`DROP TABLE IF EXISTS iam.email_verification_tokens;`);
    this.addSql(`ALTER TABLE iam.users DROP COLUMN IF EXISTS email_verified_at;`);

    this.addSql(`
      ALTER TABLE app.user_preferences
        DROP CONSTRAINT IF EXISTS quiet_hours_end_range,
        DROP CONSTRAINT IF EXISTS quiet_hours_start_range,
        DROP COLUMN IF EXISTS quiet_hours_end_min,
        DROP COLUMN IF EXISTS quiet_hours_start_min,
        DROP COLUMN IF EXISTS quiet_hours_enabled;
    `);

    this.addSql(`DROP INDEX IF EXISTS app.idx_push_subscriptions_user;`);
    this.addSql(`DROP TABLE IF EXISTS app.push_subscriptions;`);

    this.addSql(`DROP INDEX IF EXISTS iam.idx_password_reset_tokens_user;`);
    this.addSql(`DROP TABLE IF EXISTS iam.password_reset_tokens;`);
  }
}
