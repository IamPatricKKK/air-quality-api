import { Body, Controller, Delete, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { requireAuth } from "../auth/jwt";
import { PushService, PushSubscriptionInput } from "./push.service";

interface SubscribeDto extends PushSubscriptionInput {}
interface UnsubscribeDto {
  endpoint: string;
}

@Controller("push")
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get("vapid-public-key")
  getPublicKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      configured: this.pushService.isConfigured(),
    };
  }

  @Post("subscribe")
  async subscribe(
    @Body() dto: SubscribeDto,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    if (!dto?.endpoint || !dto?.keys?.p256dh || !dto?.keys?.auth) {
      return { error: "Invalid subscription payload" };
    }
    return this.pushService.saveSubscription(claims.sub, dto);
  }

  @Delete("subscribe")
  @HttpCode(200)
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
    @Headers("authorization") authHeader?: string,
  ) {
    const claims = requireAuth(authHeader);
    if (!dto?.endpoint) return { success: false };
    return this.pushService.removeSubscription(claims.sub, dto.endpoint);
  }
}
