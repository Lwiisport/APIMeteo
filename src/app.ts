import Fastify, { LogController } from 'fastify';
import { WeatherError, type WeatherQuery } from './weather.js';

export function buildApp(weather: WeatherQuery, logger = false) {
  const app = Fastify({
    logger,
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof WeatherError) {
      const status = { INVALID_ADDRESS: 400, LOCATION_NOT_FOUND: 404, PROVIDER_ERROR: 502, SERVICE_BUSY: 503 }[error.code];
      if (status === 503) reply.header('Retry-After', '2');
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    const status = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: 'INVALID_REQUEST', message: 'Fournissez un unique paramètre address de 1 à 500 caractères.' } });
    }
    request.log.error({ requestId: request.id }, 'Erreur interne.');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne.' } });
  });

  app.get<{ Querystring: { address: string } }>('/weather', {
    schema: {
      querystring: {
        type: 'object',
        required: ['address'],
        additionalProperties: false,
        properties: { address: { type: 'string', minLength: 1, maxLength: 500 } },
      },
    },
  }, (request) => weather.execute(request.query.address));

  return app;
}
