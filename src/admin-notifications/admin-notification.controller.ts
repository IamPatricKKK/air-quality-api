import { Body, Controller, Get, Headers, HttpException, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { requireAuth, requireRoles } from "../auth/jwt";
import { AdminNotificationService } from "./admin-notification.service";

const ADMIN_ROLES = ["admin", "super_admin"];

@Controller("admin/notifications")
export class AdminNotificationController {
  constructor(private readonly adminNotifications: AdminNotificationService) {}

  // ─── Broadcast ────────────────────────────────────

  @Post("broadcast")
  async broadcast(
    @Headers("authorization") authHeader: string | undefined,
    @Body() body: {
      title: string;
      body: string;
      target: "all" | "region" | "user";
      targetValue?: string;
      channels?: string[];
      scheduledAt?: string | null;
    },
  ) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);

    if (!body.title || !body.body) {
      throw new HttpException("title and body are required", 400);
    }

    const result = await this.adminNotifications.broadcast({
      title: body.title,
      body: body.body,
      target: body.target ?? "all",
      targetValue: body.targetValue,
      channels: body.channels ?? ["in_app", "push"],
      scheduledAt: body.scheduledAt,
      sentBy: claims.sub,
    });

    return { ok: true, ...result };
  }

  @Post(":id/cancel")
  async cancel(
    @Headers("authorization") authHeader: string | undefined,
    @Param("id") id: string,
  ) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    const ok = await this.adminNotifications.cancelScheduled(id);
    if (!ok) throw new HttpException("Not found or not scheduled", 404);
    return { ok: true };
  }

  // ─── Admin Inbox ──────────────────────────────────

  @Get("inbox")
  async inbox(
    @Headers("authorization") authHeader: string | undefined,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    return this.adminNotifications.getAdminInbox(
      claims.sub,
      Math.min(100, Number(limit) || 50),
      Number(offset) || 0,
    );
  }

  @Get("inbox/unread-count")
  async inboxUnreadCount(@Headers("authorization") authHeader: string | undefined) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    const count = await this.adminNotifications.getAdminInboxUnreadCount(claims.sub);
    return { count };
  }

  @Patch("inbox/:id/read")
  async markRead(
    @Headers("authorization") authHeader: string | undefined,
    @Param("id") id: string,
  ) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    await this.adminNotifications.markInboxRead(id, claims.sub);
    return { ok: true };
  }

  @Patch("inbox/read-all")
  async markAllRead(@Headers("authorization") authHeader: string | undefined) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    const count = await this.adminNotifications.markAllInboxRead(claims.sub);
    return { ok: true, count };
  }

  // ─── Daily Report Config ──────────────────────────

  @Get("daily-config")
  async getDailyConfig(@Headers("authorization") authHeader: string | undefined) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    return this.adminNotifications.getDailyConfig();
  }

  @Put("daily-config")
  async updateDailyConfig(
    @Headers("authorization") authHeader: string | undefined,
    @Body() body: { enabled?: boolean; cron?: string },
  ) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    await this.adminNotifications.updateDailyConfig(body);
    return this.adminNotifications.getDailyConfig();
  }

  @Post("daily-trigger")
  async triggerDaily(@Headers("authorization") authHeader: string | undefined) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    const recipients = await this.adminNotifications.sendDailyDigest(24);
    return { ok: true, recipients };
  }

  // ─── Digest (existing) ────────────────────────────

  @Post("digest")
  async sendDigestNow(@Headers("authorization") authHeader?: string) {
    const claims = requireAuth(authHeader);
    requireRoles(claims, ADMIN_ROLES);
    const sent = await this.adminNotifications.sendDailyDigest(24);
    return { success: true, recipients: sent };
  }
}
