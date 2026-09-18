import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetNorwayWeatherProvider } from '../../src/met-norway.js';
import { OpenMeteoWeatherProvider } from '../../src/open-meteo.js';
import type { Coordinates, WeatherProvider } from '../../src/weather.js';

const coordinates: Coordinates = { latitude: 44.126077, longitude: 4.085757 };

interface ProviderCase {
  name: string;
  create: () => WeatherProvider;
  validBody: unknown;
  expectedHour: { time: string; temperature: number | null; precipitation: number | null; shortwaveRadiation: number | null };
  expectedAttributionName: string;
}

const cases: ProviderCase[] = [
  {
    name: 'OpenMeteoWeatherProvider',
    create: () => new OpenMeteoWeatherProvider(),
    validBody: {
      utc_offset_seconds: 0,
      hourly_units: {
        time: 'unixtime',
        temperature_2m: '°C',
        precipitation: 'mm',
        shortwave_radiation: 'W/m²',
      },
      hourly: {
        time: [1789740000],
        temperature_2m: [27],
        precipitation: [0],
        shortwave_radiation: [512],
      },
    },
    expectedHour: { time: '2026-09-18T14:00:00.000Z', temperature: 27, precipitation: 0, shortwaveRadiation: 512 },
    expectedAttributionName: 'Open-Meteo',
  },
  {
    name: 'MetNorwayWeatherProvider',
    create: () => new MetNorwayWeatherProvider({
      forecastUrl: 'https://met.test/compact',
      userAgent: 'test-agent/1.0 test@example.com',
    }),
    validBody: {
      type: 'Feature',
      properties: {
        timeseries: [{
          time: '2026-09-18T14:00:00Z',
          data: {
            instant: { details: { air_temperature: 27 } },
            next_1_hours: { details: { precipitation_amount: 0 } },
          },
        }],
      },
    },
    expectedHour: { time: '2026-09-18T14:00:00.000Z', temperature: 27, precipitation: 0, shortwaveRadiation: null },
    expectedAttributionName: 'MET Norway',
  },
];

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(cases)('contrat WeatherProvider — $name', ({ create, validBody, expectedHour, expectedAttributionName }) => {
  it('retourne un Forecast normalisé', async () => {
    stubFetch(validBody);

    const forecast = await create().getForecast(coordinates);

    expect(forecast.timezone).toBe('UTC');
    expect(forecast.units).toEqual({ temperature: '°C', precipitation: 'mm', shortwaveRadiation: 'W/m²' });
    expect(forecast.hourly[0]).toEqual(expectedHour);
    expect(forecast.attribution.name).toBe(expectedAttributionName);
  });

  it('rejette une réponse HTTP en erreur avec PROVIDER_ERROR', async () => {
    stubFetch({ error: true }, 500);

    await expect(create().getForecast(coordinates)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('rejette une réponse malformée avec PROVIDER_ERROR', async () => {
    stubFetch({ unexpected: true });

    await expect(create().getForecast(coordinates)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});
