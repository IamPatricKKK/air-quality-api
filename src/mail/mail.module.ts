import { Module } from "@nestjs/common";
import { EmailService } from "../alerts/email.service";

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class MailModule {}
