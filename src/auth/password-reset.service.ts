import { createHash, randomBytes } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "../alerts/email.service";

const TOKEN_BYTES = 32;
const TTL_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  async requestReset(email: string): Promise<void> {
    const userResult = (await this.em.getConnection().execute(
      `SELECT u.id::text, u.email, up.display_name
       FROM iam.users u
       LEFT JOIN iam.user_profiles up ON up.user_id = u.id
       WHERE u.email = ? AND u.status = 'active'
       LIMIT 1`,
      [email],
    )) as UserRow[] | { rows: UserRow[] };
    const rows: UserRow[] = Array.isArray(userResult)
      ? userResult
      : (userResult.rows ?? []);

    if (rows.length === 0) {
      this.logger.log(`Password reset requested for unknown email: ${email}`);
      return;
    }

    const user = rows[0];
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

    await this.em.getConnection().execute(
      `INSERT INTO iam.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [user.id, tokenHash, expiresAt],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
    const resetUrl = `${frontendUrl.replace(/\/$/, "")}/auth/reset?token=${token}`;

    this.logger.log(`Password reset link for ${email}: ${resetUrl}`);

    const displayName = user.display_name ?? email.split("@")[0];
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
          <h2 style="color: #2dd4bf; margin: 0 0 16px;">Dat lai mat khau AirWatch</h2>
          <p style="line-height: 1.6;">Xin chao ${displayName},</p>
          <p style="line-height: 1.6;">
            Ban (hoac ai do) da yeu cau dat lai mat khau cho tai khoan ${email}.
            Bam vao nut ben duoi de tao mat khau moi. Lien ket co hieu luc trong ${TTL_MINUTES} phut.
          </p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2dd4bf; color: #0a0e1a; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Dat lai mat khau
            </a>
          </p>
          <p style="font-size: 12px; color: #9ca3af; line-height: 1.6;">
            Neu ban khong yeu cau, vui long bo qua email nay — mat khau khong thay doi.
            Lien ket day du: <br/><span style="word-break: break-all;">${resetUrl}</span>
          </p>
        </div>
      </div>
    `;

    await this.emailService.send({
      to: user.email,
      subject: "[AirWatch] Dat lai mat khau",
      html,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    if (!token || !newPassword || newPassword.length < 6) return false;
    const tokenHash = hashToken(token);

    const result = (await this.em.getConnection().execute(
      `SELECT id::text, user_id::text, expires_at, used_at
       FROM iam.password_reset_tokens
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash],
    )) as
      | { id: string; user_id: string; expires_at: string; used_at: string | null }[]
      | { rows: { id: string; user_id: string; expires_at: string; used_at: string | null }[] };
    const rows = Array.isArray(result) ? result : (result.rows ?? []);

    if (rows.length === 0) return false;
    const row = rows[0];
    if (row.used_at) return false;
    if (new Date(row.expires_at).getTime() < Date.now()) return false;

    await this.em.transactional(async (em) => {
      await em.getConnection().execute(
        `UPDATE iam.users
         SET password_hash = crypt(?, gen_salt('bf')),
             updated_at = now()
         WHERE id = ?`,
        [newPassword, row.user_id],
      );
      await em.getConnection().execute(
        `UPDATE iam.password_reset_tokens
         SET used_at = now()
         WHERE id = ?`,
        [row.id],
      );
    });

    return true;
  }
}
