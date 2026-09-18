import { buildApp } from './app.js';
import { createContainer } from './container.js';
import { TYPES } from './tokens.js';
import type { WeatherQuery } from './weather.js';

try {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT doit être compris entre 1 et 65535.');

  const container = createContainer();
  const weatherService = container.get<WeatherQuery>(TYPES.WeatherQuery);
  const app = buildApp(weatherService, true);

  const shutdown = async () => {
    try {
      await app.close();
    } catch {
      console.error('Impossible d’arrêter le serveur.');
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Impossible de démarrer le serveur.');
  process.exitCode = 1;
}
