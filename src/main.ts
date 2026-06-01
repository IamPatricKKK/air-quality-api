import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");

  // CORS: restrict to configured origins in production; allow all if unset (dev).
  // CORS_ORIGINS is a comma-separated list, e.g.
  //   "https://airquality.info.vn,https://admin.airquality.info.vn"
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle("Air Quality API")
    .setDescription("Air quality monitoring and alerting API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ?? 3002;
  await app.listen(port);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
