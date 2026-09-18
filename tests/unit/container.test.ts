import { describe, expect, it } from 'vitest';
import { BanGeocoder } from '../../src/ban-geocoder.js';
import { createContainer } from '../../src/container.js';
import { MetNorwayWeatherProvider } from '../../src/met-norway.js';
import { NominatimGeocoder } from '../../src/nominatim.js';
import { OpenMeteoWeatherProvider } from '../../src/open-meteo.js';
import { TYPES } from '../../src/tokens.js';
import type { Geocoder, WeatherProvider, WeatherQuery } from '../../src/weather.js';

describe('createContainer', () => {
  it('utilise Nominatim et Open-Meteo par défaut', () => {
    const container = createContainer({});

    expect(container.get<Geocoder>(TYPES.Geocoder)).toBeInstanceOf(NominatimGeocoder);
    expect(container.get<WeatherProvider>(TYPES.WeatherProvider)).toBeInstanceOf(OpenMeteoWeatherProvider);
  });

  it('sélectionne la BAN quand GEOCODER_PROVIDER=ban', () => {
    const container = createContainer({ GEOCODER_PROVIDER: 'ban' });

    expect(container.get<Geocoder>(TYPES.Geocoder)).toBeInstanceOf(BanGeocoder);
  });

  it('sélectionne MET Norway quand WEATHER_PROVIDER=metnorway', () => {
    const container = createContainer({
      WEATHER_PROVIDER: 'metnorway',
      MET_NORWAY_USER_AGENT: 'APIMeteo-TP2/1.0 test@example.com',
    });

    expect(container.get<WeatherProvider>(TYPES.WeatherProvider)).toBeInstanceOf(MetNorwayWeatherProvider);
  });

  it('rejette une valeur inconnue', () => {
    expect(() => createContainer({ GEOCODER_PROVIDER: 'inconnu' })).toThrow(/Géocodeur inconnu/u);
    expect(() => createContainer({ WEATHER_PROVIDER: 'inconnu' })).toThrow(/Fournisseur météo inconnu/u);
  });

  it('exige MET_NORWAY_USER_AGENT avec WEATHER_PROVIDER=metnorway', () => {
    expect(() => createContainer({ WEATHER_PROVIDER: 'metnorway' })).toThrow(/MET_NORWAY_USER_AGENT/u);
  });

  it('résout WeatherQuery avec les implémentations choisies', () => {
    const container = createContainer({
      GEOCODER_PROVIDER: 'ban',
      WEATHER_PROVIDER: 'metnorway',
      MET_NORWAY_USER_AGENT: 'APIMeteo-TP2/1.0 test@example.com',
    });

    expect(container.get<WeatherQuery>(TYPES.WeatherQuery)).toBeDefined();
    expect(container.get<WeatherQuery>(TYPES.WeatherQuery)).toBe(container.get<WeatherQuery>(TYPES.WeatherQuery));
  });
});
