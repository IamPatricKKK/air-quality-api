import { createHash, randomBytes } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { EmailService } from "../alerts/email.service";

const TOKEN_BYTES = 32;
const TTL_MINUTES = 24 * 60; // 24h

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  email_verified_at: string | null;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  async sendVerification(userId: string, email: string, displayName: string): Promise<void> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

    await this.em.getConnection().execute(
      `INSERT INTO iam.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [userId, tokenHash, expiresAt],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
    const verifyUrl = `${frontendUrl.replace(/\/$/, "")}/auth/verify?token=${token}`;

    this.logger.log(`Email verification link for ${email}: ${verifyUrl}`);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
          <h2 style="color: #2dd4bf; margin: 0 0 16px;">Xac thuc email CLKKVN</h2>
          <p style="line-height: 1.6;">Xin chao ${displayName},</p>
          <p style="line-height: 1.6;">
            Cam on ban da dang ky tai khoan CLKKVN (${email}). Bam vao nut ben duoi
            de xac thuc dia chi email. Lien ket co hieu luc trong 24 gio.
          </p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #2dd4bf; color: #0a0e1a; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Xac thuc email
            </a>
          </p>
          <p style="font-size: 12px; color: #9ca3af; line-height: 1.6;">
            Neu ban khong dang ky tai khoan nay, vui long bo qua email — khong co thay doi nao xay ra.
            Lien ket day du: <br/><span style="word-break: break-all;">${verifyUrl}</span>
          </p>
        </div>
      </div>
    `;

    await this.emailService.send({
      to: email,
      subject: "[CLKKVN] Xac thuc dia chi email",
      html,
    });
  }

  async confirm(token: string): Promise<boolean> {
    if (!token) return false;
    const tokenHash = hashToken(token);

    const result = (await this.em.getConnection().execute(
      `SELECT id::text, user_id::text, expires_at, used_at
         FROM iam.email_verification_tokens
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
            SET email_verified_at = COALESCE(email_verified_at, now()),
                updated_at = now()
          WHERE id = ?::uuid`,
        [row.user_id],
      );
      await em.getConnection().execute(
        `UPDATE iam.email_verification_tokens
            SET used_at = now()
          WHERE id = ?::uuid`,
        [row.id],
      );
    });

    return true;
  }

  /**
   * Look up a user by email and send (or re-send) a verification link if the
   * account exists and is still unverified. Returns silently in all cases to
   * avoid leaking which emails are registered.
   */
  async resend(email: string): Promise<void> {
    const result = (await this.em.getConnection().execute(
      `SELECT u.id::text, u.email, up.display_name, u.email_verified_at
         FROM iam.users u
         LEFT JOIN iam.user_profiles up ON up.user_id = u.id
        WHERE u.email = ? AND u.status = 'active'
        LIMIT 1`,
      [email],
    )) as UserRow[] | { rows: UserRow[] };
    const rows: UserRow[] = Array.isArray(result) ? result : (result.rows ?? []);

    if (rows.length === 0) {
      this.logger.log(`Verification resend requested for unknown email: ${email}`);
      return;
    }

    const user = rows[0];
    if (user.email_verified_at) {
      this.logger.log(`Verification resend skipped — already verified: ${email}`);
      return;
    }

    const displayName = user.display_name ?? email.split("@")[0];
    await this.sendVerification(user.id, user.email, displayName);
  }
}
