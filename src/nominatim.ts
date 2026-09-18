import { inject, injectable } from 'inversify';
import { z } from 'zod';
import { TYPES } from './tokens.js';
import { WeatherError, type Geocoder, type Location } from './weather.js';

export interface NominatimConfig {
  searchUrl: string;
  userAgent: string;
}

const coordinate = z.string().trim().min(1).transform(Number).pipe(z.number().finite());
const resultsSchema = z.array(z.object({
  lat: coordinate.pipe(z.number().min(-90).max(90)),
  lon: coordinate.pipe(z.number().min(-180).max(180)),
  display_name: z.string().min(1),
}));

@injectable()
export class NominatimGeocoder implements Geocoder {
  private readonly cache = new Map<string, { location: Location | null; expiresAt: number }>();
  private lastRequestAt = -Infinity;
  private readonly searchUrl: string;
  private readonly userAgent: string;

  constructor(@inject(TYPES.NominatimConfig) config: NominatimConfig) {
    this.searchUrl = config.searchUrl;
    this.userAgent = config.userAgent;
  }

  async geocode(address: string): Promise<Location | null> {
    const key = address.normalize('NFC').toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.location;
    this.cache.delete(key);

    if (Date.now() - this.lastRequestAt < 1_100) {
      throw new WeatherError('SERVICE_BUSY', 'Géocodage trop sollicité. Réessayez dans une seconde.');
    }
    this.lastRequestAt = Date.now();

    try {
      const url = new URL(this.searchUrl);
      url.search = new URLSearchParams({ q: address, format: 'json', limit: '1' }).toString();
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Échec du géocodage.');
      }
      const [place] = resultsSchema.parse(await response.json());
      const location: Location | null = place ? {
        displayName: place.display_name,
        coordinates: { latitude: place.lat, longitude: place.lon },
        attribution: {
          name: '© OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
          license: 'ODbL 1.0',
        },
      } : null;

      if (this.cache.size >= 1_000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { location, expiresAt: Date.now() + 86_400_000 });
      return location;
    } catch {
      throw new WeatherError('PROVIDER_ERROR', 'Le service de géocodage ne répond pas correctement.');
    }
  }
}
