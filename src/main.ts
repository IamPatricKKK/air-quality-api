import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors();

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
