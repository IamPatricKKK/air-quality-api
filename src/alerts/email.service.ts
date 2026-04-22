import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS) — emails disabled");
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    return this.transporter;
  }

  async send(payload: EmailPayload): Promise<boolean> {
    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn(`Email skipped (no SMTP): ${payload.subject}`);
      return false;
    }

    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      this.logger.log(`Email sent to ${payload.to}: ${payload.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Email failed to ${payload.to}: ${err}`);
      return false;
    }
  }
}
