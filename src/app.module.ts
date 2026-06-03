import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './mikro-orm.config';

import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { StationsController } from './stations/stations.controller';
import { WardsController } from './wards/wards.controller';
import { AdminController } from './admin/admin.controller';
import { UsersController } from './users/users.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { WellKnownController } from './well-known/well-known.controller';
import { IngestModule } from './ingest/ingest.module';
import { AlertsModule } from './alerts/alerts.module';
import { PushModule } from './push/push.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminNotificationsModule } from './admin-notifications/admin-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // NOTE: every named throttler registered here applies to EVERY route
    // (AND-combined) unless a route overrides it with @Throttle/@SkipThrottle.
    // So these are the limits for PUBLIC endpoints (/stations, /wards, ...),
    // which the website hits on every page load + polling + service-worker.
    // Keep them generous. The strict anti-brute-force limits live ONLY on the
    // auth routes via @Throttle({ medium / long: {...} }) overrides — e.g.
    // login = 5/min, register = 3/hour — so raising the global ceilings here
    // does NOT weaken auth protection.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 120 }, // ~2 req/s/IP burst
      { name: 'medium', ttl: 60_000, limit: 120 }, // overridden to 5–10/min on auth routes
      { name: 'long', ttl: 60 * 60_000, limit: 5000 }, // overridden to 3/hour on auth routes
    ]),
    MikroOrmModule.forRoot(mikroOrmConfig),
    RealtimeModule,
    AuthModule,
    IngestModule,
    PushModule,
    AlertsModule,
    AdminNotificationsModule,
  ],
  controllers: [
    HealthController,
    StationsController,
    WardsController,
    AdminController,
    UsersController,
    NotificationsController,
    WellKnownController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
