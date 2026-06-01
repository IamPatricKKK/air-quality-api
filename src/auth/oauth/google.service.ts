import { Injectable, UnauthorizedException, ServiceUnavailableException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private client: OAuth2Client | null = null;

  private get clientId(): string {
    return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  }

  isConfigured(): boolean {
    return Boolean(this.clientId);
  }

  private getClient(): OAuth2Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Đăng nhập Google chưa được cấu hình trên máy chủ");
    }
    if (!this.client) {
      this.client = new OAuth2Client(this.clientId);
    }
    return this.client;
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Đăng nhập Google chưa được cấu hình trên máy chủ");
    }
    if (!idToken) {
      throw new UnauthorizedException("Thiếu Google ID token");
    }

    let payload;
    try {
      const ticket = await this.getClient().verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Google token không hợp lệ");
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException("Google token không hợp lệ");
    }
    if (payload.email_verified === false) {
      throw new UnauthorizedException("Email Google chưa được xác minh");
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? payload.email.split("@")[0],
      picture: payload.picture,
    };
  }

  /**
   * Verify a Google OAuth2 access token (from the implicit flow used by the
   * custom-styled sign-in button) by fetching the user's profile from Google's
   * userinfo endpoint. The access token is opaque, so trust comes from the
   * call succeeding against Google's own API.
   */
  async verifyAccessToken(accessToken: string): Promise<GoogleProfile> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Đăng nhập Google chưa được cấu hình trên máy chủ");
    }
    if (!accessToken) {
      throw new UnauthorizedException("Thiếu Google access token");
    }

    let data: {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
    };
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`userinfo ${res.status}`);
      }
      data = (await res.json()) as typeof data;
    } catch {
      throw new UnauthorizedException("Google token không hợp lệ");
    }

    if (!data?.sub || !data.email) {
      throw new UnauthorizedException("Google token không hợp lệ");
    }
    // userinfo returns email_verified as boolean true or string "true"
    const emailVerified = data.email_verified === true || data.email_verified === "true";
    if (data.email_verified === false || data.email_verified === "false") {
      throw new UnauthorizedException("Email Google chưa được xác minh");
    }

    return {
      googleId: data.sub,
      email: data.email,
      emailVerified,
      name: data.name ?? data.email.split("@")[0],
      picture: data.picture,
    };
  }
}
