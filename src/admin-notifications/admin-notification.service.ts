import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "../alerts/email.service";

interface DigestData {
  windowHours: number;
  newUsers: { email: string; created_at: string }[];
  newUserCount: number;
  observationCount: number;
  ingestRuns: { status: string; count: number }[];
  ingestFailures: { error_summary: string | null; started_at: string }[];
  alertsFired: number;
}

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  /** Emails of every active admin / super_admin account. */
  async getAdminEmails(): Promise<string[]> {
    const rows = (await this.em.getConnection().execute(
      `SELECT DISTINCT u.email
         FROM iam.users u
         JOIN iam.user_roles ur ON ur.user_id = u.id
         JOIN iam.roles r ON r.id = ur.role_id
        WHERE r.code IN ('admin', 'super_admin')
          AND u.status = 'active'`,
    )) as { email: string }[] | { rows: { email: string }[] };
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r) => r.email);
  }

  private async gatherDigest(windowHours = 24): Promise<DigestData> {
    const win = `${windowHours} hours`;
    const conn = this.em.getConnection();

    const newUsers = (await conn.execute(
      `SELECT email, created_at FROM iam.users
        WHERE created_at > now() - ($1 || '')::interval
        ORDER BY created_at DESC`,
      [win],
    )) as any;
    const newUsersRows = Array.isArray(newUsers) ? newUsers : (newUsers.rows ?? []);

    const obs = (await conn.execute(
      `SELECT count(*)::int AS c FROM core.air_quality_observations
        WHERE created_at > now() - ($1 || '')::interval`,
      [win],
    )) as any;
    const obsCount = (Array.isArray(obs) ? obs[0] : obs.rows?.[0])?.c ?? 0;

    const runs = (await conn.execute(
      `SELECT status::text AS status, count(*)::int AS count
         FROM ingest.pipeline_runs
        WHERE started_at > now() - ($1 || '')::interval
        GROUP BY status`,
      [win],
    )) as any;
    const runsRows = Array.isArray(runs) ? runs : (runs.rows ?? []);

    const failures = (await conn.execute(
      `SELECT error_summary, started_at
         FROM ingest.pipeline_runs
        WHERE started_at > now() - ($1 || '')::interval
          AND status = 'failed'
        ORDER BY started_at DESC
        LIMIT 10`,
      [win],
    )) as any;
    const failuresRows = Array.isArray(failures) ? failures : (failures.rows ?? []);

    const alerts = (await conn.execute(
      `SELECT count(*)::int AS c FROM app.alerts
        WHERE created_at > now() - ($1 || '')::interval`,
      [win],
    )) as any;
    const alertsCount = (Array.isArray(alerts) ? alerts[0] : alerts.rows?.[0])?.c ?? 0;

    return {
      windowHours,
      newUsers: newUsersRows,
      newUserCount: newUsersRows.length,
      observationCount: obsCount,
      ingestRuns: runsRows,
      ingestFailures: failuresRows,
      alertsFired: alertsCount,
    };
  }

  private buildHtml(d: DigestData): string {
    const row = (label: string, value: string | number) => `
      <tr>
        <td style="padding: 8px 0; color: #9ca3af;">${label}</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${value}</td>
      </tr>`;

    const usersList = d.newUsers.length
      ? `<ul style="margin: 4px 0 0; padding-left: 18px; color: #e0e0e0;">${d.newUsers
          .slice(0, 20)
          .map((u) => `<li>${u.email}</li>`)
          .join("")}</ul>`
      : `<span style="color: #6b7280;">Khong co</span>`;

    const runsSummary = d.ingestRuns.length
      ? d.ingestRuns.map((r) => `${r.status}: ${r.count}`).join(" · ")
      : "Khong co";

    const failuresBlock = d.ingestFailures.length
      ? `<div style="margin-top: 12px; padding: 12px; background: #3b1212; border-radius: 8px;">
           <strong style="color: #fca5a5;">Cronjob loi (${d.ingestFailures.length}):</strong>
           <ul style="margin: 4px 0 0; padding-left: 18px; color: #fca5a5;">
             ${d.ingestFailures.map((f) => `<li>${(f.error_summary ?? "Khong ro").slice(0, 160)}</li>`).join("")}
           </ul>
         </div>`
      : "";

    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
          <h2 style="color: #2dd4bf; margin: 0 0 4px;">Bao cao he thong CLKKVN</h2>
          <p style="color: #9ca3af; margin: 0 0 16px; font-size: 13px;">Tong hop ${d.windowHours} gio qua</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${row("Nguoi dung moi dang ky", d.newUserCount)}
            ${row("Du lieu quan trac moi", d.observationCount)}
            ${row("Cronjob ingest", runsSummary)}
            ${row("Canh bao da kich hoat", d.alertsFired)}
          </table>
          <div style="margin-top: 14px;">
            <span style="color: #9ca3af; font-size: 13px;">Danh sach user moi:</span>
            ${usersList}
          </div>
          ${failuresBlock}
          <hr style="border: none; border-top: 1px solid #374151; margin: 16px 0;" />
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Email tu dong gui toi quan tri vien — Chat Luong Khong Khi Viet Nam
          </p>
        </div>
      </div>`;
  }

  /** Build and send the system digest to every admin. Returns recipients count. */
  async sendDailyDigest(windowHours = 24): Promise<number> {
    const admins = await this.getAdminEmails();
    if (admins.length === 0) {
      this.logger.warn("No admin recipients — digest skipped");
      return 0;
    }

    const data = await this.gatherDigest(windowHours);
    const html = this.buildHtml(data);

    let sent = 0;
    for (const to of admins) {
      const ok = await this.emailService.send({
        to,
        subject: "[CLKKVN] Bao cao he thong hang ngay",
        html,
      });
      if (ok) sent++;
    }
    this.logger.log(`Daily digest sent to ${sent}/${admins.length} admin(s)`);
    return sent;
  }
}
