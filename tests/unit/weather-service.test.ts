import { Container } from 'inversify';
import { describe, expect, it } from 'vitest';
import { TYPES } from '../../src/tokens.js';
import {
  WeatherService,
  type Coordinates,
  type Forecast,
  type Geocoder,
  type Location,
  type WeatherProvider,
  type WeatherQuery,
} from '../../src/weather.js';

const location: Location = {
  displayName: 'Alès, France',
  coordinates: { latitude: 44.125, longitude: 4.085 },
  attribution: {
    name: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL 1.0',
  },
};

const forecast: Forecast = {
  timezone: 'UTC',
  units: { temperature: '°C', precipitation: 'mm', shortwaveRadiation: 'W/m²' },
  hourly: [{ time: '2026-09-18T12:00:00.000Z', temperature: 20, precipitation: 0, shortwaveRadiation: 500 }],
  attribution: { name: 'Open-Meteo', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
};

class GeocoderStub implements Geocoder {
  calls: string[] = [];

  constructor(private readonly location: Location | null) {}

  async geocode(address: string): Promise<Location | null> {
    this.calls.push(address);
    return this.location;
  }
}

class WeatherProviderStub implements WeatherProvider {
  calls: Coordinates[] = [];

  async getForecast(coordinates: Coordinates): Promise<Forecast> {
    this.calls.push(coordinates);
    return forecast;
  }
}

function createService(geocoder: Geocoder, weatherProvider: WeatherProvider): WeatherQuery {
  const container = new Container();
  container.bind<Geocoder>(TYPES.Geocoder).toConstantValue(geocoder);
  container.bind<WeatherProvider>(TYPES.WeatherProvider).toConstantValue(weatherProvider);
  container.bind<WeatherQuery>(TYPES.WeatherQuery).to(WeatherService);
  return container.get<WeatherQuery>(TYPES.WeatherQuery);
}

describe('WeatherService', () => {
  it('normalise l’adresse et transmet les coordonnées au fournisseur météo', async () => {
    const geocoder = new GeocoderStub(location);
    const provider = new WeatherProviderStub();
    const service = createService(geocoder, provider);

    const report = await service.execute('  Alès,   France  ');

    expect(geocoder.calls).toEqual(['Alès, France']);
    expect(provider.calls).toEqual([location.coordinates]);
    expect(report).toEqual({ address: 'Alès, France', location, forecast });
  });

  it('rejette une adresse invalide sans appeler les fournisseurs', async () => {
    const geocoder = new GeocoderStub(location);
    const provider = new WeatherProviderStub();
    const service = createService(geocoder, provider);

    await expect(service.execute('   ')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(geocoder.calls).toEqual([]);
    expect(provider.calls).toEqual([]);
  });

  it('retourne LOCATION_NOT_FOUND si le lieu est introuvable', async () => {
    const geocoder = new GeocoderStub(null);
    const provider = new WeatherProviderStub();
    const service = createService(geocoder, provider);

    await expect(service.execute('Adresse inconnue')).rejects.toMatchObject({ code: 'LOCATION_NOT_FOUND' });
    expect(provider.calls).toEqual([]);
  });
});
