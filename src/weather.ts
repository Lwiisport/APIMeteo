import { inject, injectable } from 'inversify';
import { TYPES } from './tokens.js';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Attribution {
  name: string;
  url: string;
  license: string;
}

export interface Location {
  displayName: string;
  coordinates: Coordinates;
  attribution: Attribution;
}

export interface Forecast {
  timezone: 'UTC';
  units: { temperature: '°C'; precipitation: 'mm'; shortwaveRadiation: 'W/m²' };
  hourly: {
    time: string;
    temperature: number | null;
    precipitation: number | null;
    shortwaveRadiation: number | null;
  }[];
  attribution: Attribution;
}

export interface WeatherReport {
  address: string;
  location: Location;
  forecast: Forecast;
}

export interface Geocoder {
  geocode(address: string): Promise<Location | null>;
}

export interface WeatherProvider {
  getForecast(coordinates: Coordinates): Promise<Forecast>;
}

export interface WeatherQuery {
  execute(address: string): Promise<WeatherReport>;
}

export class WeatherError extends Error {
  constructor(
    readonly code: 'INVALID_ADDRESS' | 'LOCATION_NOT_FOUND' | 'PROVIDER_ERROR' | 'SERVICE_BUSY',
    message: string,
  ) {
    super(message);
    this.name = 'WeatherError';
  }
}

@injectable()
export class WeatherService implements WeatherQuery {
  constructor(
    @inject(TYPES.Geocoder) private readonly geocoder: Geocoder,
    @inject(TYPES.WeatherProvider) private readonly weatherProvider: WeatherProvider,
  ) {}

  async execute(address: string): Promise<WeatherReport> {
    if (!address.trim() || address.length > 500 || /[\u0000-\u001f\u007f]/u.test(address)) {
      throw new WeatherError('INVALID_ADDRESS', 'L’adresse doit contenir de 1 à 500 caractères, sans caractères de contrôle.');
    }
    address = address.trim().replace(/\s+/gu, ' ');
    const location = await this.geocoder.geocode(address);
    if (!location) throw new WeatherError('LOCATION_NOT_FOUND', 'Adresse introuvable.');

    const forecast = await this.weatherProvider.getForecast(location.coordinates);
    return { address, location, forecast };
  }
}
