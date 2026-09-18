import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { WeatherError, type WeatherQuery, type WeatherReport } from '../../src/weather.js';

const report: WeatherReport = {
  address: 'Alès, France',
  location: {
    displayName: 'Alès, France',
    coordinates: { latitude: 44.125, longitude: 4.085 },
    attribution: {
      name: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL 1.0',
    },
  },
  forecast: {
    timezone: 'UTC',
    units: { temperature: '°C', precipitation: 'mm', shortwaveRadiation: 'W/m²' },
    hourly: [{ time: '2026-09-18T12:00:00.000Z', temperature: 20, precipitation: 0, shortwaveRadiation: 500 }],
    attribution: { name: 'Open-Meteo', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
  },
};

let app: ReturnType<typeof buildApp> | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /weather', () => {
  it('retourne les prévisions fournies par WeatherQuery', async () => {
    let receivedAddress = '';
    const weather: WeatherQuery = {
      async execute(address) {
        receivedAddress = address;
        return report;
      },
    };
    app = buildApp(weather);

    const response = await app.inject({ method: 'GET', url: '/weather?address=Al%C3%A8s%2C%20France' });

    expect(response.statusCode).toBe(200);
    expect(receivedAddress).toBe('Alès, France');
    expect(response.json()).toEqual(report);
  });

  it('rejette une requête sans address', async () => {
    app = buildApp({ async execute() { return report; } });

    const response = await app.inject({ method: 'GET', url: '/weather' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'Fournissez un unique paramètre address de 1 à 500 caractères.' },
    });
  });

  it('traduit un lieu introuvable en 404', async () => {
    app = buildApp({
      async execute() {
        throw new WeatherError('LOCATION_NOT_FOUND', 'Adresse introuvable.');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/weather?address=Inconnue' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'LOCATION_NOT_FOUND', message: 'Adresse introuvable.' },
    });
  });
});
