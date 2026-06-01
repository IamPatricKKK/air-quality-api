import { Migration } from '@mikro-orm/migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Adds OAuth identity columns (auth_provider, google_id, facebook_id,
 * avatar_url) to iam.users so users can sign in with Google/Facebook.
 *
 * The applied SQL is idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX
 * IF NOT EXISTS), so it converges whether the database was bootstrapped
 * from the updated db/schema.sql or an older one.
 */
export class Migration00002_oauth_columns extends Migration {
  override async up(): Promise<void> {
    const root = join(__dirname, '..', '..');
    const sql = readFileSync(join(root, 'db/migrations/016_oauth_columns.sql'), 'utf-8');
    this.addSql(sql);
  }

  override async down(): Promise<void> {
    this.addSql('DROP INDEX IF EXISTS iam.uq_iam_users_facebook_id');
    this.addSql('DROP INDEX IF EXISTS iam.uq_iam_users_google_id');
    this.addSql(`
      ALTER TABLE iam.users
        DROP COLUMN IF EXISTS auth_provider,
        DROP COLUMN IF EXISTS google_id,
        DROP COLUMN IF EXISTS facebook_id,
        DROP COLUMN IF EXISTS avatar_url
    `);
  }
}
