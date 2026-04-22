import { Controller, Get } from "@nestjs/common";
import { getJwks } from "../auth/jwt";

@Controller(".well-known")
export class WellKnownController {
  @Get("jwks.json")
  getJwks() {
    return getJwks();
  }
}
