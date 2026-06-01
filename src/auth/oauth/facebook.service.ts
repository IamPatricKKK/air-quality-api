import { Injectable, UnauthorizedException, ServiceUnavailableException } from "@nestjs/common";

export interface FacebookProfile {
  facebookId: string;
  email?: string;
  name: string;
  picture?: string;
}

@Injectable()
export class FacebookAuthService {
  private get appId(): string {
    return (process.env.FACEBOOK_APP_ID ?? "").trim();
  }

  private get appSecret(): string {
    return (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  async verifyAccessToken(accessToken: string): Promise<FacebookProfile> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Đăng nhập Facebook chưa được cấu hình trên máy chủ");
    }
    if (!accessToken) {
      throw new UnauthorizedException("Thiếu Facebook access token");
    }

    const appToken = `${this.appId}|${this.appSecret}`;

    let debug: { data?: { is_valid?: boolean; app_id?: string } };
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
      );
      debug = (await debugRes.json()) as typeof debug;
    } catch {
      throw new UnauthorizedException("Không xác minh được Facebook token");
    }

    if (!debug.data?.is_valid || debug.data.app_id !== this.appId) {
      throw new UnauthorizedException("Facebook token không hợp lệ");
    }

    let profile: { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
      );
      profile = (await profileRes.json()) as typeof profile;
    } catch {
      throw new UnauthorizedException("Không lấy được hồ sơ Facebook");
    }

    if (!profile.id) {
      throw new UnauthorizedException("Facebook token không hợp lệ");
    }

    return {
      facebookId: profile.id,
      email: profile.email,
      name: profile.name ?? `fb_${profile.id}`,
      picture: profile.picture?.data?.url,
    };
  }
}
