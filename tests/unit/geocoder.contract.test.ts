import { afterEach, describe, expect, it, vi } from 'vitest';
import { BanGeocoder } from '../../src/ban-geocoder.js';
import { NominatimGeocoder } from '../../src/nominatim.js';
import type { Geocoder, Location } from '../../src/weather.js';

const coordinates = { latitude: 44.126077, longitude: 4.085757 };

interface GeocoderCase {
  name: string;
  create: () => Geocoder;
  foundBody: unknown;
  emptyBody: unknown;
  expectedDisplayName: string;
  expectedAttributionName: string;
}

const cases: GeocoderCase[] = [
  {
    name: 'NominatimGeocoder',
    create: () => new NominatimGeocoder({
      searchUrl: 'https://nominatim.test/search',
      userAgent: 'test-agent/1.0',
    }),
    foundBody: [{ lat: '44.126077', lon: '4.085757', display_name: 'Alès, France' }],
    emptyBody: [],
    expectedDisplayName: 'Alès, France',
    expectedAttributionName: '© OpenStreetMap contributors',
  },
  {
    name: 'BanGeocoder',
    create: () => new BanGeocoder({
      searchUrl: 'https://ban.test/search/',
      userAgent: 'test-agent/1.0',
    }),
    foundBody: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [4.085757, 44.126077] },
        properties: { label: 'Boulevard Anatole France 30100 Alès', score: 0.95 },
      }],
    },
    emptyBody: { type: 'FeatureCollection', features: [] },
    expectedDisplayName: 'Boulevard Anatole France 30100 Alès',
    expectedAttributionName: 'Base Adresse Nationale',
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

describe.each(cases)('contrat Geocoder — $name', ({ create, foundBody, emptyBody, expectedDisplayName, expectedAttributionName }) => {
  it('retourne un Location normalisé pour une adresse valide', async () => {
    stubFetch(foundBody);

    const location = await create().geocode('Alès, France');

    const expected: Location = {
      displayName: expectedDisplayName,
      coordinates,
      attribution: expect.objectContaining({ name: expectedAttributionName }) as Location['attribution'],
    };
    expect(location).toEqual(expected);
  });

  it('retourne null quand le lieu est introuvable', async () => {
    stubFetch(emptyBody);

    await expect(create().geocode('Lieu inexistant')).resolves.toBeNull();
  });

  it('rejette une réponse malformée avec PROVIDER_ERROR', async () => {
    stubFetch({ unexpected: true });

    await expect(create().geocode('Alès')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('encode les caractères accentués dans la requête', async () => {
    const fetchMock = stubFetch(foundBody);

    await create().geocode('Alès, Éléonore');

    const [input] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const url = input instanceof URL ? input : new URL(String(input));
    expect(url.searchParams.get('q')).toBe('Alès, Éléonore');
  });
});
