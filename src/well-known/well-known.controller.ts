import { Controller, Get } from "@nestjs/common";

@Controller(".well-known")
export class WellKnownController {
  @Get("jwks.json")
  getJwks() {
    return {
      keys: [
        {
          kty: "RSA",
          use: "sig",
          kid: "air-quality-api-dev-key",
          alg: "RS256",
          n: "placeholder-modulus",
          e: "AQAB",
        },
      ],
    };
  }
}
