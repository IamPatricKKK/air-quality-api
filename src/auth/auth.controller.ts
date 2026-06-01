import { randomUUID } from "crypto";
import { BadRequestException, Body, Controller, Get, Headers, Post, Query, UnauthorizedException, Inject } from "@nestjs/common";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { EntityManager } from "@mikro-orm/core";
import { hasDatabase } from "../db/database";
import { issueAccessToken, mapClaimsToUser, requireAuth, resolveActingUserId } from "./jwt";
import { PasswordResetService } from "./password-reset.service";
import { EmailVerificationService } from "./email-verification.service";
import { GoogleAuthService } from "./oauth/google.service";
import { FacebookAuthService } from "./oauth/facebook.service";
import { User } from "../entities/iam/user.entity";
import { UserProfile } from "../entities/iam/user-profile.entity";
import { Role } from "../entities/iam/role.entity";
import { UserRole } from "../entities/iam/user-role.entity";

interface DbAuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  emailVerifiedAt?: string | null;
}

function buildAuthResponse(user: {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}) {
  const session = issueAccessToken(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      user_metadata: {
        display_name: user.displayName,
      },
    },
    session: {
      access_token: session.token,
      token_type: "bearer",
      expires_at: session.expiresAt,
    },
  };
}

async function loadUserByEmail(em: EntityManager, email: string, password: string): Promise<DbAuthUser | null> {
  // Use raw SQL for PostgreSQL crypt() function verification
  const result = await em.getConnection().execute<{ id: string; email: string; display_name?: string; roles?: string[]; email_verified_at?: string | null }>(
    `
      SELECT
        u.id::text,
        u.email,
        u.email_verified_at,
        up.display_name,
        ARRAY_REMOVE(ARRAY_AGG(r.code), NULL) AS roles
      FROM iam.users u
      LEFT JOIN iam.user_profiles up ON up.user_id = u.id
      LEFT JOIN iam.user_roles ur ON ur.user_id = u.id
      LEFT JOIN iam.roles r ON r.id = ur.role_id
      WHERE u.email = ?
        AND u.password_hash = crypt(?, u.password_hash)
      GROUP BY u.id, up.display_name, u.email_verified_at
      LIMIT 1
    `,
    [email, password],
  );

  if (!result || result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? email.split("@")[0],
    roles: row.roles ?? ["user"],
    emailVerifiedAt: row.email_verified_at ?? null,
  };
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    private readonly passwordReset: PasswordResetService,
    private readonly emailVerification: EmailVerificationService,
    private readonly googleAuth: GoogleAuthService,
    private readonly facebookAuth: FacebookAuthService,
  ) {}

  @Post("forgot-password")
  @Throttle({ long: { limit: 3, ttl: 60 * 60_000 } })
  async forgotPassword(@Body() body: { email?: string }) {
    if (!body?.email) {
      throw new BadRequestException("Email is required");
    }
    // Always return success to avoid leaking which emails exist
    await this.passwordReset.requestReset(body.email);
    return { success: true, message: "Nếu email tồn tại, link đặt lại mật khẩu đã được gửi." };
  }

  @Post("reset-password")
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() body: { token?: string; password?: string }) {
    if (!body?.token || !body?.password) {
      throw new BadRequestException("Token và mật khẩu là bắt buộc");
    }
    if (body.password.length < 6) {
      throw new BadRequestException("Mật khẩu phải có ít nhất 6 ký tự");
    }
    const ok = await this.passwordReset.resetPassword(body.token, body.password);
    if (!ok) {
      throw new BadRequestException("Token không hợp lệ hoặc đã hết hạn");
    }
    return { success: true };
  }

  @Post("login")
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: { email: string; password?: string }) {
    if (hasDatabase()) {
      if (!body.password) {
        throw new UnauthorizedException("Password is required");
      }

      const row = await loadUserByEmail(this.em, body.email, body.password);
      if (row) {
        if (!row.emailVerifiedAt) {
          throw new UnauthorizedException({
            code: "email_not_verified",
            message: "Vui lòng xác thực email trước khi đăng nhập.",
          });
        }

        // Update last login timestamp (raw SQL to avoid Collection init issues)
        await this.em.getConnection().execute(
          `UPDATE iam.users SET last_login_at = now() WHERE id = ?::uuid`,
          [row.id],
        );

        return buildAuthResponse(row);
      }

      throw new UnauthorizedException("Invalid credentials");
    }

    const isAdminEmail = body.email.includes("admin");
    return buildAuthResponse({
      id: randomUUID(),
      email: body.email,
      displayName: isAdminEmail ? "Platform Admin" : body.email.split("@")[0],
      roles: isAdminEmail ? ["super_admin", "data:read", "data:operate"] : ["user"],
    });
  }

  @Post("register")
  @Throttle({ long: { limit: 3, ttl: 60 * 60_000 } })
  async register(@Body() body: { email: string; password?: string; displayName?: string }) {
    const password = body.password ?? "air-quality-password";
    const roleCode = body.email.includes("admin")
      ? "admin"
      : body.email.includes("ops")
        ? "operator"
        : body.email.includes("analyst")
          ? "analyst"
          : "user";

    const createdUser = await this.em.transactional(async (em) => {
      // Check if user already exists
      let user = await em.findOne(User, { email: body.email });

      if (!user) {
        // Create new user with hashed password using PostgreSQL crypt function
        const result = await em.getConnection().execute<{ id: string }>(
          `
            INSERT INTO iam.users (email, password_hash, status)
            VALUES (?, crypt(?, gen_salt('bf')), 'active')
            ON CONFLICT (email) DO NOTHING
            RETURNING id
          `,
          [body.email, password],
        );

        if (!result || result.length === 0) {
          // User already exists from concurrent operation
          user = await em.findOne(User, { email: body.email });
          if (!user) {
            return null;
          }
        } else {
          // Fetch the newly created user
          user = await em.findOne(User, { id: result[0].id });
          if (!user) {
            return null;
          }
        }
      }

      // Create or update user profile
      let profile = await em.findOne(UserProfile, { user: { id: user.id } });
      if (!profile) {
        profile = em.create(UserProfile, {
          user: user.id,
          displayName: body.displayName ?? body.email.split("@")[0],
        });
      } else {
        profile.displayName = body.displayName ?? body.email.split("@")[0];
      }
      await em.persistAndFlush(profile);

      // Get or create role
      const role = await em.findOne(Role, { code: roleCode });
      if (!role) {
        return null;
      }

      // Create user role assignment if not exists
      const existingUserRole = await em.findOne(UserRole, {
        user: { id: user.id },
        role: { id: role.id },
      });

      if (!existingUserRole) {
        const userRole = em.create(UserRole, {
          user: user.id,
          role: role.id,
        });
        await em.persistAndFlush(userRole);
      }

      return {
        id: user.id,
        email: user.email,
        displayName: body.displayName ?? body.email.split("@")[0],
        roles: [roleCode],
      };
    });

    if (createdUser) {
      // Send verification email (no session is returned — user must verify first)
      try {
        await this.emailVerification.sendVerification(
          createdUser.id,
          createdUser.email,
          createdUser.displayName,
        );
      } catch (err) {
        // Don't fail registration if SMTP is misconfigured — log and surface
        // the same response so client can prompt the user to resend later.
      }
      return {
        pending_verification: true,
        email: createdUser.email,
        message: "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.",
      };
    }

    if (hasDatabase()) {
      throw new UnauthorizedException("Unable to create user");
    }

    return buildAuthResponse({
      id: randomUUID(),
      email: body.email,
      displayName: body.displayName ?? body.email.split("@")[0],
      roles: ["user"],
    });
  }

  @Post("verify-email")
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() body: { token?: string }) {
    if (!body?.token) {
      throw new BadRequestException("Token là bắt buộc");
    }
    const ok = await this.emailVerification.confirm(body.token);
    if (!ok) {
      throw new BadRequestException("Token không hợp lệ hoặc đã hết hạn");
    }
    return { success: true };
  }

  @Post("resend-verification")
  @Throttle({ long: { limit: 3, ttl: 60 * 60_000 } })
  async resendVerification(@Body() body: { email?: string }) {
    if (!body?.email) {
      throw new BadRequestException("Email là bắt buộc");
    }
    // Always return success to avoid leaking which emails exist or are already verified
    await this.emailVerification.resend(body.email);
    return {
      success: true,
      message: "Nếu email tồn tại và chưa được xác thực, liên kết mới đã được gửi.",
    };
  }

  @Post("google")
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async googleLogin(@Body() body: { idToken?: string; accessToken?: string }) {
    if (!body?.idToken && !body?.accessToken) {
      throw new BadRequestException("idToken hoặc accessToken là bắt buộc");
    }
    const profile = body.idToken
      ? await this.googleAuth.verifyIdToken(body.idToken)
      : await this.googleAuth.verifyAccessToken(body.accessToken!);
    const user = await this.findOrCreateOAuthUser({
      provider: "google",
      providerId: profile.googleId,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
    });
    return buildAuthResponse(user);
  }

  @Post("facebook")
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async facebookLogin(@Body() body: { accessToken?: string }) {
    if (!body?.accessToken) {
      throw new BadRequestException("accessToken là bắt buộc");
    }
    const profile = await this.facebookAuth.verifyAccessToken(body.accessToken);
    const user = await this.findOrCreateOAuthUser({
      provider: "facebook",
      providerId: profile.facebookId,
      email: profile.email ?? `fb_${profile.facebookId}@facebook.local`,
      displayName: profile.name,
      avatarUrl: profile.picture,
    });
    return buildAuthResponse(user);
  }

  @Get("me")
  @SkipThrottle()
  async me(@Headers("authorization") authHeader?: string, @Query("userId") userId?: string) {
    if (authHeader) {
      const claims = requireAuth(authHeader);
      const effectiveUserId = resolveActingUserId(userId, claims);
      const row = await this.loadUserById(effectiveUserId);

      if (row) {
        return {
          id: row.id,
          email: row.email,
          roles: row.roles,
          displayName: row.displayName,
          user_metadata: {
            display_name: row.displayName,
          },
        };
      }

      return mapClaimsToUser(claims);
    }

    if (userId) {
      const row = await this.loadUserById(userId);

      if (row) {
        return {
          id: row.id,
          email: row.email,
          roles: row.roles,
          displayName: row.displayName,
          user_metadata: {
            display_name: row.displayName,
          },
        };
      }
    }

    return {
      id: randomUUID(),
      email: "user@skypulse.local",
      roles: ["user"],
      displayName: "Sky Pulse User",
      user_metadata: {
        display_name: "Sky Pulse User",
      },
    };
  }

  @Post("logout")
  @SkipThrottle()
  logout() {
    return { ok: true };
  }

  private async findOrCreateOAuthUser(params: {
    provider: "google" | "facebook";
    providerId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<DbAuthUser> {
    const { provider, providerId, email, displayName, avatarUrl } = params;
    const idColumn = provider === "google" ? "googleId" : "facebookId";

    const userId = await this.em.transactional(async (em) => {
      let user =
        (await em.findOne(User, { [idColumn]: providerId })) ??
        (await em.findOne(User, { email }));

      if (user) {
        // Link the OAuth identity + update last login in one raw SQL statement.
        // Avoids MikroORM persistAndFlush which can fail on uninitialized Collections.
        const idCol = provider === "google" ? "google_id" : "facebook_id";
        await em.getConnection().execute(
          `UPDATE iam.users
              SET ${idCol} = ?,
                  avatar_url = COALESCE(?, avatar_url),
                  last_login_at = now(),
                  email_verified_at = COALESCE(email_verified_at, now())
            WHERE id = ?::uuid`,
          [providerId, avatarUrl ?? null, user.id],
        );
      } else {
        // OAuth users have no usable password — store a random unguessable hash
        // so password login is impossible until they use "forgot password".
        // Email is marked verified because the OAuth provider already vouched for it.
        const result = await em.getConnection().execute<{ id: string }>(
          `
            INSERT INTO iam.users (email, password_hash, status, auth_provider, ${provider === "google" ? "google_id" : "facebook_id"}, avatar_url, email_verified_at)
            VALUES (?, crypt(?, gen_salt('bf')), 'active', ?, ?, ?, now())
            ON CONFLICT (email) DO NOTHING
            RETURNING id
          `,
          [email, randomUUID(), provider, providerId, avatarUrl ?? null],
        );

        if (!result || result.length === 0) {
          user = await em.findOne(User, { email });
          if (!user) {
            throw new UnauthorizedException("Không thể tạo tài khoản");
          }
        } else {
          user = await em.findOne(User, { id: result[0].id });
          if (!user) {
            throw new UnauthorizedException("Không thể tạo tài khoản");
          }
        }
      }

      // Ensure profile (display name + avatar).
      await em.getConnection().execute(
        `INSERT INTO iam.user_profiles (user_id, display_name, avatar_url)
         VALUES (?::uuid, ?, ?)
         ON CONFLICT (user_id) DO UPDATE
           SET display_name = COALESCE(NULLIF(iam.user_profiles.display_name, ''), EXCLUDED.display_name),
               avatar_url   = COALESCE(EXCLUDED.avatar_url, iam.user_profiles.avatar_url)`,
        [user.id, displayName, avatarUrl ?? null],
      );

      // Ensure default 'user' role.
      await em.getConnection().execute(
        `INSERT INTO iam.user_roles (user_id, role_id)
         SELECT ?::uuid, r.id FROM iam.roles r WHERE r.code = 'user'
         ON CONFLICT DO NOTHING`,
        [user.id],
      );

      return user.id;
    });

    const row = await this.loadUserById(userId);
    return row ?? { id: userId, email, displayName, roles: ["user"] };
  }

  private async loadUserById(userId: string): Promise<DbAuthUser | null> {
    // Use raw SQL for aggregating roles efficiently
    const result = await this.em.getConnection().execute<{ id: string; email: string; display_name?: string; roles?: string[] }>(
      `
        SELECT
          u.id::text,
          u.email,
          up.display_name,
          ARRAY_REMOVE(ARRAY_AGG(r.code), NULL) AS roles
        FROM iam.users u
        LEFT JOIN iam.user_profiles up ON up.user_id = u.id
        LEFT JOIN iam.user_roles ur ON ur.user_id = u.id
        LEFT JOIN iam.roles r ON r.id = ur.role_id
        WHERE u.id = ?::uuid
        GROUP BY u.id, up.display_name
        LIMIT 1
      `,
      [userId],
    );

    if (!result || result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name ?? row.email.split("@")[0],
      roles: row.roles ?? ["user"],
    };
  }
}
