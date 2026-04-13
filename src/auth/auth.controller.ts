import { randomUUID } from "crypto";
import { Body, Controller, Get, Post, Query, UnauthorizedException } from "@nestjs/common";
import { execute, hasDatabase, queryRow, withTransaction } from "../db/database";

interface DbAuthUser {
  id: string;
  email: string;
  display_name: string | null;
  roles: string[] | null;
}

function buildAuthResponse(user: {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}) {
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
      access_token: `session-${randomUUID()}`,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
    },
  };
}

async function loadUserByEmail(email: string, password: string) {
  return queryRow<DbAuthUser>(
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
}

@Controller("auth")
export class AuthController {
  @Post("login")
  async login(@Body() body: { email: string; password?: string }) {
    if (hasDatabase()) {
      if (!body.password) {
        throw new UnauthorizedException("Password is required");
      }

      const row = await loadUserByEmail(body.email, body.password);
      if (row) {
        await execute(
          `
            UPDATE iam.users
            SET last_login_at = now(),
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [row.id],
        );

        return buildAuthResponse({
          id: row.id,
          email: row.email,
          displayName: row.display_name ?? row.email.split("@")[0],
          roles: row.roles ?? ["user"],
        });
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

    const createdUser = await withTransaction(async (client) => {
      const user = await client.query<{ id: string; email: string }>(
        `
          WITH inserted AS (
            INSERT INTO iam.users (email, password_hash, status)
            VALUES ($1, crypt($2, gen_salt('bf')), 'active')
            ON CONFLICT (email) DO NOTHING
            RETURNING id::text, email
          )
          SELECT id, email
          FROM inserted
          UNION ALL
          SELECT id::text, email
          FROM iam.users
          WHERE email = $1
          LIMIT 1
        `,
        [body.email, password],
      );

      const userRow = user.rows[0];
      if (!userRow) {
        return null;
      }

      await client.query(
        `
          INSERT INTO iam.user_profiles (user_id, display_name)
          VALUES ($1::uuid, $2)
          ON CONFLICT (user_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            updated_at = now()
        `,
        [userRow.id, body.displayName ?? body.email.split("@")[0]],
      );

      await client.query(
        `
          INSERT INTO iam.user_roles (user_id, role_id)
          SELECT $1::uuid, id
          FROM iam.roles
          WHERE code = $2
          ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        [userRow.id, roleCode],
      );

      return {
        id: userRow.id,
        email: userRow.email,
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
  async me(@Query("userId") userId?: string) {
    if (userId) {
      const row = await queryRow<DbAuthUser>(
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

      if (row) {
        return {
          id: row.id,
          email: row.email,
          roles: row.roles ?? ["user"],
          displayName: row.display_name ?? row.email.split("@")[0],
          user_metadata: {
            display_name: row.display_name ?? row.email.split("@")[0],
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
}
