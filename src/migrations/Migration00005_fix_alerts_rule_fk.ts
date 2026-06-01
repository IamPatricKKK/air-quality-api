import { Migration } from '@mikro-orm/migrations';

/**
 * Fixes a schema/code mismatch that silently broke ALL alert delivery
 * (email/in-app/push).
 *
 * The application reads and writes alert rules from `app.user_alert_rules`
 * (MikroORM `UserAlertRule` entity, AlertRulesService, AlertEvaluatorService),
 * but `app.alerts.rule_id` had a foreign key pointing at the legacy
 * `app.alert_rules` table. So every attempt to persist a fired alert violated
 * the FK, the INSERT threw, the error was swallowed by the evaluator's
 * per-rule try/catch, and 0 alerts were ever created.
 *
 * Repoint the FK at `app.user_alert_rules` so fired alerts can be stored and
 * dispatched. Safe because no alerts reference the legacy table.
 */
export class Migration00005_fix_alerts_rule_fk extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE app.alerts DROP CONSTRAINT IF EXISTS alerts_rule_id_fkey;`);
    this.addSql(`
      ALTER TABLE app.alerts
        ADD CONSTRAINT alerts_rule_id_fkey
        FOREIGN KEY (rule_id) REFERENCES app.user_alert_rules(id) ON DELETE CASCADE;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE app.alerts DROP CONSTRAINT IF EXISTS alerts_rule_id_fkey;`);
    this.addSql(`
      ALTER TABLE app.alerts
        ADD CONSTRAINT alerts_rule_id_fkey
        FOREIGN KEY (rule_id) REFERENCES app.alert_rules(id) ON DELETE CASCADE;
    `);
  }
}
