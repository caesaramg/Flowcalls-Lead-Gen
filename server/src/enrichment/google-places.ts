/**
 * Google Places API (New). Used for two things:
 *  - lead acquisition: Text Search for "<query> in <city>"
 *  - enrichment: Place Details refresh of rating / reviews / hours / website
 *
 * Results are stored as Google returns them. Place data stays subject to
 * Google's terms — see docs/COMPLIANCE.md for the caching/attribution notes.
 */
import { env } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';
import { normalisePostcode } from '../domain/uk.js';

const BASE = 'https://places.googleapis.com/v1';

const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'primaryTypeDisplayName',
  'types',
  'editorialSummary',
  'regularOpeningHours',
  'businessStatus',
];

interface PlaceAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface Place {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: PlaceAddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  editorialSummary?: { text?: string };
  regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
  businessStatus?: string;
}

export function googlePlacesConfigured(): boolean {
  return env.googlePlacesApiKey !== '';
}

function component(place: Place, type: string): string | null {
  const match = place.addressComponents?.find((c) => c.types?.includes(type));
  return match?.longText ?? match?.shortText ?? null;
}

/** Maps a Places record onto our lead fields. */
export function placeToLead(place: Place): Record<string, unknown> {
  const hours = place.regularOpeningHours?.weekdayDescriptions ?? [];
  const open24 = hours.some((h) => /open 24 hours/i.test(h));
  const postcode = normalisePostcode(component(place, 'postal_code'));

  const values: Record<string, unknown> = {
    company_name: place.displayName?.text ?? '',
    google_place_id: place.id ?? null,
    address_line: place.formattedAddress ?? null,
    city: component(place, 'postal_town') ?? component(place, 'locality') ?? null,
    postcode,
    region: component(place, 'administrative_area_level_1'),
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    google_rating: typeof place.rating === 'number' ? place.rating : null,
    google_review_count: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    google_maps_url: place.googleMapsUri ?? null,
    google_category: place.primaryTypeDisplayName?.text ?? place.types?.[0] ?? null,
    google_description: place.editorialSummary?.text ?? null,
    opening_hours: hours.length > 0 ? JSON.stringify(hours) : null,
    opens_24_7: open24 ? 1 : 0,
    source: 'google_places',
  };

  for (const key of Object.keys(values)) {
    if (values[key] === null || values[key] === '') delete values[key];
  }
  values['company_name'] = place.displayName?.text ?? '';
  return values;
}

export interface PlacesSearchResult {
  ok: boolean;
  message: string;
  places: Array<Record<string, unknown>>;
  /** Businesses Google marked as closed — excluded from `places`. */
  skippedClosed: number;
}

/**
 * Text Search. Google returns up to 20 per page and 3 pages in total.
 */
export async function searchPlaces(query: string, maxResults = 20): Promise<PlacesSearchResult> {
  if (!googlePlacesConfigured()) {
    return { ok: false, message: 'GOOGLE_PLACES_API_KEY not set — skipped', places: [], skippedClosed: 0 };
  }

  const collected: Place[] = [];
  let pageToken: string | undefined;
  let skippedClosed = 0;

  while (collected.length < maxResults) {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: 'en-GB',
      regionCode: 'GB',
      pageSize: Math.min(20, maxResults - collected.length),
    };
    if (pageToken) body['pageToken'] = pageToken;

    const response = await fetchJson<{ places?: Place[]; nextPageToken?: string }>(
      `${BASE}/places:searchText`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': env.googlePlacesApiKey,
          'X-Goog-FieldMask': PLACE_FIELDS.map((f) => `places.${f}`).join(','),
        },
        body: JSON.stringify(body),
        throttleHost: true,
      },
    );

    if (!response.ok) {
      return {
        ok: collected.length > 0,
        message: response.error ?? `Places search failed (HTTP ${response.status})`,
        places: collected.map(placeToLead),
        skippedClosed,
      };
    }

    const batch = response.data?.places ?? [];
    for (const place of batch) {
      if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
        skippedClosed += 1;
        continue;
      }
      collected.push(place);
    }

    pageToken = response.data?.nextPageToken;
    if (!pageToken || batch.length === 0) break;
  }

  return {
    ok: true,
    message: `${collected.length} place(s) for "${query}"`,
    places: collected.map(placeToLead),
    skippedClosed,
  };
}

export interface PlaceDetailsResult {
  ok: boolean;
  message: string;
  updates: Record<string, unknown>;
}

export async function refreshPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  if (!googlePlacesConfigured()) {
    return { ok: false, message: 'GOOGLE_PLACES_API_KEY not set — skipped', updates: {} };
  }

  const response = await fetchJson<Place>(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=en-GB`, {
    headers: {
      'X-Goog-Api-Key': env.googlePlacesApiKey,
      'X-Goog-FieldMask': PLACE_FIELDS.join(','),
    },
  });

  if (!response.ok || !response.data) {
    return { ok: false, message: response.error ?? `Place details failed (HTTP ${response.status})`, updates: {} };
  }

  const updates = placeToLead(response.data);
  delete updates['company_name']; // never rename an existing lead from a refresh
  delete updates['source'];
  return { ok: true, message: 'Google Places details refreshed', updates };
}

/** Finds the place id for a business we only know by name + locality. */
export async function findPlaceId(companyName: string, locality?: string | null): Promise<string | null> {
  const query = [companyName, locality, 'UK'].filter(Boolean).join(', ');
  const result = await searchPlaces(query, 1);
  const first = result.places[0];
  return (first?.['google_place_id'] as string | undefined) ?? null;
}
