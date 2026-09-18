import { Container } from 'inversify';
import { BanGeocoder, type BanGeocoderConfig } from './ban-geocoder.js';
import { MetNorwayWeatherProvider, type MetNorwayConfig } from './met-norway.js';
import { NominatimGeocoder, type NominatimConfig } from './nominatim.js';
import { OpenMeteoWeatherProvider } from './open-meteo.js';
import { TYPES } from './tokens.js';
import { WeatherService, type Geocoder, type WeatherProvider, type WeatherQuery } from './weather.js';

export function createContainer(environment: NodeJS.ProcessEnv = process.env): Container {
  const container = new Container();

  const geocoderProvider = (environment.GEOCODER_PROVIDER ?? 'nominatim').trim().toLowerCase();
  if (geocoderProvider === 'ban') {
    container.bind<BanGeocoderConfig>(TYPES.BanGeocoderConfig).toConstantValue({
      searchUrl: environment.BAN_SEARCH_URL ?? 'https://api-adresse.data.gouv.fr/search/',
      userAgent: environment.BAN_USER_AGENT ?? 'APIMeteo-TP2/1.0',
    });
    container.bind<Geocoder>(TYPES.Geocoder).to(BanGeocoder).inSingletonScope();
  } else if (geocoderProvider === 'nominatim') {
    container.bind<NominatimConfig>(TYPES.NominatimConfig).toConstantValue({
      searchUrl: environment.NOMINATIM_SEARCH_URL ?? 'https://nominatim.openstreetmap.org/search',
      userAgent: environment.NOMINATIM_USER_AGENT ?? 'APIMeteo-TP1/1.0',
    });
    container.bind<Geocoder>(TYPES.Geocoder).to(NominatimGeocoder).inSingletonScope();
  } else {
    throw new Error(`Géocodeur inconnu : ${environment.GEOCODER_PROVIDER}. Valeurs possibles : nominatim, ban.`);
  }

  const weatherProvider = (environment.WEATHER_PROVIDER ?? 'openmeteo').trim().toLowerCase();
  if (weatherProvider === 'metnorway') {
    const userAgent = environment.MET_NORWAY_USER_AGENT?.trim();
    if (!userAgent) throw new Error('MET_NORWAY_USER_AGENT est obligatoire avec WEATHER_PROVIDER=metnorway.');
    container.bind<MetNorwayConfig>(TYPES.MetNorwayConfig).toConstantValue({
      forecastUrl: environment.MET_NORWAY_FORECAST_URL ?? 'https://api.met.no/weatherapi/locationforecast/2.0/compact',
      userAgent,
    });
    container.bind<WeatherProvider>(TYPES.WeatherProvider).to(MetNorwayWeatherProvider).inSingletonScope();
  } else if (weatherProvider === 'openmeteo') {
    container.bind<WeatherProvider>(TYPES.WeatherProvider).to(OpenMeteoWeatherProvider).inSingletonScope();
  } else {
    throw new Error(`Fournisseur météo inconnu : ${environment.WEATHER_PROVIDER}. Valeurs possibles : openmeteo, metnorway.`);
  }

  container.bind<WeatherQuery>(TYPES.WeatherQuery).to(WeatherService).inSingletonScope();

  return container;
}
