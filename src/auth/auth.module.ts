import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { PasswordResetService } from "./password-reset.service";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [MailModule],
  providers: [PasswordResetService],
  controllers: [AuthController],
  exports: [PasswordResetService],
})
export class AuthModule {}
