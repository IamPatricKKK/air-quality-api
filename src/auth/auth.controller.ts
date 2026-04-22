import { randomUUID } from "crypto";
import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException, Inject } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { hasDatabase } from "../db/database";
import { issueAccessToken, mapClaimsToUser, requireAuth, resolveActingUserId } from "./jwt";
import { User } from "../entities/iam/user.entity";
import { UserProfile } from "../entities/iam/user-profile.entity";
import { Role } from "../entities/iam/role.entity";
import { UserRole } from "../entities/iam/user-role.entity";

interface DbAuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
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
  const result = await em.getConnection().execute<{ id: string; email: string; display_name?: string; roles?: string[] }>(
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
      WHERE u.email = $1
        AND u.password_hash = crypt($2, u.password_hash)
      GROUP BY u.id, up.display_name
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
  };
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  @Post("login")
  async login(@Body() body: { email: string; password?: string }) {
    if (hasDatabase()) {
      if (!body.password) {
        throw new UnauthorizedException("Password is required");
      }

      const row = await loadUserByEmail(this.em, body.email, body.password);
      if (row) {
        // Update last login timestamp
        const user = await this.em.findOne(User, { id: row.id });
        if (user) {
          user.lastLoginAt = new Date();
          user.updatedAt = new Date();
          await this.em.persistAndFlush(user);
        }

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
            VALUES ($1, crypt($2, gen_salt('bf')), 'active')
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
      return buildAuthResponse(createdUser);
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

  @Get("me")
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
  logout() {
    return { ok: true };
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
        WHERE u.id = $1::uuid
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
