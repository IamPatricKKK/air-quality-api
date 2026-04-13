import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./auth/auth.controller";
import { StationsController } from "./stations/stations.controller";
import { AdminController } from "./admin/admin.controller";
import { UsersController } from "./users/users.controller";
import { NotificationsController } from "./notifications/notifications.controller";
import { WellKnownController } from "./well-known/well-known.controller";

@Module({
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
