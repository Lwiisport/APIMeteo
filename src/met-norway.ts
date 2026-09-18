import { inject, injectable } from 'inversify';
import { z } from 'zod';
import { TYPES } from './tokens.js';
import { WeatherError, type Coordinates, type Forecast, type WeatherProvider } from './weather.js';

export interface MetNorwayConfig {
  forecastUrl: string;
  userAgent: string;
}

const forecastSchema = z.object({
  properties: z.object({
    timeseries: z.array(z.object({
      time: z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value))),
      data: z.object({
        instant: z.object({
          details: z.object({
            air_temperature: z.number().finite().nullable().optional(),
          }),
        }),
        next_1_hours: z.object({
          details: z.object({
            precipitation_amount: z.number().finite().nullable().optional(),
          }),
        }).optional(),
      }),
    })).min(1).max(384),
  }),
});

@injectable()
export class MetNorwayWeatherProvider implements WeatherProvider {
  private readonly forecastUrl: string;
  private readonly userAgent: string;

  constructor(@inject(TYPES.MetNorwayConfig) config: MetNorwayConfig) {
    this.forecastUrl = config.forecastUrl;
    this.userAgent = config.userAgent;
  }

  async getForecast(coordinates: Coordinates): Promise<Forecast> {
    try {
      const url = new URL(this.forecastUrl);
      url.search = new URLSearchParams({
        lat: coordinates.latitude.toFixed(4),
        lon: coordinates.longitude.toFixed(4),
      }).toString();
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Échec de la météo.');
      }
      const { timeseries } = forecastSchema.parse(await response.json()).properties;
      return {
        timezone: 'UTC',
        units: { temperature: '°C', precipitation: 'mm', shortwaveRadiation: 'W/m²' },
        hourly: timeseries.map((entry) => ({
          time: new Date(entry.time).toISOString(),
          temperature: entry.data.instant.details.air_temperature ?? null,
          precipitation: entry.data.next_1_hours?.details.precipitation_amount ?? null,
          shortwaveRadiation: null,
        })),
        attribution: { name: 'MET Norway', url: 'https://www.met.no/en', license: 'NLOD 2.0 / CC BY 4.0' },
      };
    } catch {
      throw new WeatherError('PROVIDER_ERROR', 'Le service météo ne répond pas correctement.');
    }
  }
}
