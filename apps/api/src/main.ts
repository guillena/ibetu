import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // El 3000 queda para la web (Next.js), que llama a la API por proxy.
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
