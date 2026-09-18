import { inject, injectable } from 'inversify';
import { z } from 'zod';
import { TYPES } from './tokens.js';
import { WeatherError, type Geocoder, type Location } from './weather.js';

export interface BanGeocoderConfig {
  searchUrl: string;
  userAgent: string;
}

const resultsSchema = z.object({
  features: z.array(z.object({
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z.array(z.number().finite()).min(2).max(3),
    }),
    properties: z.object({
      label: z.string().min(1),
      score: z.number().min(0).max(1),
    }),
  })),
});

@injectable()
export class BanGeocoder implements Geocoder {
  private readonly searchUrl: string;
  private readonly userAgent: string;

  constructor(@inject(TYPES.BanGeocoderConfig) config: BanGeocoderConfig) {
    this.searchUrl = config.searchUrl;
    this.userAgent = config.userAgent;
  }

  async geocode(address: string): Promise<Location | null> {
    try {
      const url = new URL(this.searchUrl);
      url.search = new URLSearchParams({ q: address, limit: '1' }).toString();
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/geo+json' },
        signal: AbortSignal.timeout(5_000),
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Échec du géocodage.');
      }
      const [place] = resultsSchema.parse(await response.json()).features;
      return place ? {
        displayName: place.properties.label,
        coordinates: {
          latitude: place.geometry.coordinates[1],
          longitude: place.geometry.coordinates[0],
        },
        attribution: {
          name: 'Base Adresse Nationale',
          url: 'https://adresse.data.gouv.fr/',
          license: 'Licence Ouverte 2.0',
        },
      } : null;
    } catch {
      throw new WeatherError('PROVIDER_ERROR', 'Le service de géocodage ne répond pas correctement.');
    }
  }
}
