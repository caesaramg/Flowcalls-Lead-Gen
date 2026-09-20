/**
 * Optional Google Maps acquisition via an Apify actor (default:
 * compass~crawler-google-places). Useful when you want Maps coverage without a
 * Google Cloud billing account.
 *
 * Runs are synchronous-with-dataset-items, so one call returns the rows.
 */
import { env } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';
import { normalisePostcode } from '../domain/uk.js';

export function apifyConfigured(): boolean {
  return env.apifyToken !== '';
}

interface ApifyPlace {
  title?: string;
  placeId?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  countryCode?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  categoryName?: string;
  description?: string;
  openingHours?: Array<{ day?: string; hours?: string }> | string[];
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  emails?: string[];
  searchString?: string;
}

export function apifyPlaceToLead(place: ApifyPlace): Record<string, unknown> {
  const hours = Array.isArray(place.openingHours)
    ? place.openingHours.map((h) => (typeof h === 'string' ? h : `${h.day ?? ''}: ${h.hours ?? ''}`.trim()))
    : [];
  const open24 = hours.some((h) => /open 24|24 ?hours/i.test(h));

  const values: Record<string, unknown> = {
    company_name: place.title ?? '',
    google_place_id: place.placeId ?? null,
    phone: place.phoneUnformatted ?? place.phone ?? null,
    website: place.website ?? null,
    address_line: place.address ?? null,
    city: place.city ?? null,
    postcode: normalisePostcode(place.postalCode),
    region: place.state ?? null,
    google_rating: typeof place.totalScore === 'number' ? place.totalScore : null,
    google_review_count: typeof place.reviewsCount === 'number' ? place.reviewsCount : null,
    google_maps_url: place.url ?? null,
    google_category: place.categoryName ?? null,
    google_description: place.description ?? null,
    opening_hours: hours.length > 0 ? JSON.stringify(hours) : null,
    opens_24_7: open24 ? 1 : 0,
    email: place.emails?.[0] ?? null,
    source: 'apify',
    source_ref: place.searchString ?? null,
  };

  for (const key of Object.keys(values)) {
    if (values[key] === null || values[key] === '') delete values[key];
  }
  values['company_name'] = place.title ?? '';
  return values;
}

export interface ApifySearchResult {
  ok: boolean;
  message: string;
  places: Array<Record<string, unknown>>;
  skippedClosed: number;
}

export async function searchGoogleMapsViaApify(
  queries: string[],
  maxPerQuery = 25,
): Promise<ApifySearchResult> {
  if (!apifyConfigured()) {
    return { ok: false, message: 'APIFY_TOKEN not set — skipped', places: [], skippedClosed: 0 };
  }

  const actor = env.apifyGoogleMapsActor;
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;

  const response = await fetchJson<ApifyPlace[]>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: queries,
      maxCrawledPlacesPerSearch: maxPerQuery,
      language: 'en',
      countryCode: 'gb',
      skipClosedPlaces: true,
      scrapeContacts: false,
    }),
    // Actor runs take minutes, not seconds.
    timeoutMs: 15 * 60 * 1000,
    throttleHost: false,
  });

  if (!response.ok || !Array.isArray(response.data)) {
    return { ok: false, message: response.error ?? 'Apify run failed', places: [], skippedClosed: 0 };
  }

  let skippedClosed = 0;
  const places: Array<Record<string, unknown>> = [];
  for (const place of response.data) {
    if (place.permanentlyClosed || place.temporarilyClosed) {
      skippedClosed += 1;
      continue;
    }
    if (!place.title) continue;
    places.push(apifyPlaceToLead(place));
  }

  return { ok: true, message: `${places.length} place(s) from Apify`, places, skippedClosed };
}
