import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { PasswordResetService } from "./password-reset.service";
import { EmailVerificationService } from "./email-verification.service";
import { GoogleAuthService } from "./oauth/google.service";
import { FacebookAuthService } from "./oauth/facebook.service";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [MailModule],
  providers: [PasswordResetService, EmailVerificationService, GoogleAuthService, FacebookAuthService],
  controllers: [AuthController],
  exports: [PasswordResetService, EmailVerificationService],
})
export class AuthModule {}
