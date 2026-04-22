import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './mikro-orm.config';

import { HealthController } from './health/health.controller';
import { AuthController } from './auth/auth.controller';
import { StationsController } from './stations/stations.controller';
import { AdminController } from './admin/admin.controller';
import { UsersController } from './users/users.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { WellKnownController } from './well-known/well-known.controller';
import { IngestModule } from './ingest/ingest.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MikroOrmModule.forRoot(mikroOrmConfig),
    IngestModule,
    AlertsModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    StationsController,
    AdminController,
    UsersController,
    NotificationsController,
    WellKnownController,
  ],
})
export class AppModule {}
