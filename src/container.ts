import { Container } from 'inversify';
import { NominatimGeocoder, type NominatimConfig } from './nominatim.js';
import { OpenMeteoWeatherProvider } from './open-meteo.js';
import { TYPES } from './tokens.js';
import { WeatherService, type Geocoder, type WeatherProvider, type WeatherQuery } from './weather.js';

export function createContainer(environment: NodeJS.ProcessEnv = process.env): Container {
  const container = new Container();

  container.bind<NominatimConfig>(TYPES.NominatimConfig).toConstantValue({
    searchUrl: environment.NOMINATIM_SEARCH_URL ?? 'https://nominatim.openstreetmap.org/search',
    userAgent: environment.NOMINATIM_USER_AGENT ?? 'APIMeteo-TP1/1.0',
  });
  container.bind<Geocoder>(TYPES.Geocoder).to(NominatimGeocoder).inSingletonScope();
  container.bind<WeatherProvider>(TYPES.WeatherProvider).to(OpenMeteoWeatherProvider).inSingletonScope();
  container.bind<WeatherQuery>(TYPES.WeatherQuery).to(WeatherService).inSingletonScope();

  return container;
}
