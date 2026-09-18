import { injectable } from 'inversify';
import { z } from 'zod';
import { WeatherError, type Coordinates, type Forecast, type WeatherProvider } from './weather.js';

const measurement = z.number().finite().nullable();
const forecastSchema = z.object({
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal('unixtime'),
    temperature_2m: z.literal('°C'),
    precipitation: z.literal('mm'),
    shortwave_radiation: z.literal('W/m²'),
  }),
  hourly: z.object({
    time: z.array(z.number().int().min(0).max(253402300799)).min(1).max(384),
    temperature_2m: z.array(measurement),
    precipitation: z.array(measurement),
    shortwave_radiation: z.array(measurement),
  }).refine((hourly) => (
    hourly.time.length === hourly.temperature_2m.length
    && hourly.time.length === hourly.precipitation.length
    && hourly.time.length === hourly.shortwave_radiation.length
  )),
});

@injectable()
export class OpenMeteoWeatherProvider implements WeatherProvider {
  async getForecast(coordinates: Coordinates): Promise<Forecast> {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        hourly: 'temperature_2m,precipitation,shortwave_radiation',
        forecast_days: '7',
        timezone: 'GMT',
        timeformat: 'unixtime',
        temperature_unit: 'celsius',
        precipitation_unit: 'mm',
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Échec de la météo.');
      }
      const { hourly } = forecastSchema.parse(await response.json());
      return {
        timezone: 'UTC',
        units: { temperature: '°C', precipitation: 'mm', shortwaveRadiation: 'W/m²' },
        hourly: hourly.time.map((time, index) => ({
          time: new Date(time * 1_000).toISOString(),
          temperature: hourly.temperature_2m[index]!,
          precipitation: hourly.precipitation[index]!,
          shortwaveRadiation: hourly.shortwave_radiation[index]!,
        })),
        attribution: { name: 'Open-Meteo', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
      };
    } catch {
      throw new WeatherError('PROVIDER_ERROR', 'Le service météo ne répond pas correctement.');
    }
  }
}
