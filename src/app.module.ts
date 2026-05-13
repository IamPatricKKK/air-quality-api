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
import { AdminController } from './admin/admin.controller';
import { UsersController } from './users/users.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { WellKnownController } from './well-known/well-known.controller';
import { IngestModule } from './ingest/ingest.module';
import { AlertsModule } from './alerts/alerts.module';
import { PushModule } from './push/push.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 5 },
      { name: 'long', ttl: 60 * 60_000, limit: 10 },
    ]),
    MikroOrmModule.forRoot(mikroOrmConfig),
    RealtimeModule,
    AuthModule,
    IngestModule,
    PushModule,
    AlertsModule,
  ],
  controllers: [
    HealthController,
    StationsController,
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
