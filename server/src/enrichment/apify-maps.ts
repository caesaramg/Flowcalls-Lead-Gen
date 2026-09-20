/**
 * Google Maps acquisition via an Apify actor (default:
 * compass~crawler-google-places). Useful when you want Maps coverage without a
 * Google Cloud billing account.
 *
 * Field names below match what the actor actually returns — notably
 * `ownerDescription` (the business's own write-up, far richer than
 * `description`) and the array-valued `emails` / `facebooks` / `instagrams` /
 * `linkedIns` contact fields.
 */
import { env } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';
import { normalisePostcode } from '../domain/uk.js';
import { detectServices } from './classify.js';

export function apifyConfigured(): boolean {
  return env.apifyToken !== '';
}

export interface ApifyPlace {
  title?: string;
  placeId?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  address?: string | null;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  state?: string | null;
  countryCode?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  url?: string;
  categoryName?: string | null;
  categories?: string[];
  description?: string | null;
  /** The owner-written "from the business" blurb. Richest text Maps gives us. */
  ownerDescription?: string | null;
  openingHours?: Array<{ day?: string; hours?: string } | string>;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  emails?: string[];
  facebooks?: string[];
  instagrams?: string[];
  linkedIns?: string[];
  /** Google's own attribute groups, e.g. { "Service options": { "Onsite services": true } }. */
  additionalInfo?: Record<string, unknown>;
  searchString?: string;
  isAdvertisement?: boolean;
}

const ROLE_EMAIL = /^(?:info|enquiries|enquiry|contact|hello|admin|office|sales|accounts|service|bookings|support|mail|team)@/i;

/**
 * Business inboxes only. A named personal address is more personal data than
 * B2B prospecting needs — see docs/COMPLIANCE.md.
 */
export function pickBusinessEmail(emails: string[] | undefined): string | null {
  if (!emails?.length) return null;
  const cleaned = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return cleaned.find((e) => ROLE_EMAIL.test(e)) ?? null;
}

/** Flattens Google's attribute groups into the words they represent. */
export function additionalInfoText(info: Record<string, unknown> | undefined): string {
  if (!info) return '';
  const words: string[] = [];
  for (const [group, entries] of Object.entries(info)) {
    const rows = Array.isArray(entries) ? entries : [entries];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      for (const [label, enabled] of Object.entries(row as Record<string, unknown>)) {
        if (enabled === true) words.push(`${group}: ${label}`);
      }
    }
  }
  return words.join('. ');
}

export function openingHoursText(hours: ApifyPlace['openingHours']): string[] {
  if (!Array.isArray(hours)) return [];
  return hours
    .map((entry) =>
      typeof entry === 'string' ? entry : `${entry.day ?? ''}: ${entry.hours ?? ''}`.trim().replace(/^:\s*/, ''),
    )
    .filter((line) => line !== '' && line !== ':');
}

export function apifyPlaceToLead(place: ApifyPlace): Record<string, unknown> {
  const hours = openingHoursText(place.openingHours);
  const open24 = hours.some((h) => /open 24|24 ?hours/i.test(h));
  const blurb = place.ownerDescription ?? place.description ?? null;

  const values: Record<string, unknown> = {
    company_name: place.title ?? '',
    google_place_id: place.placeId ?? null,
    phone: place.phoneUnformatted ?? place.phone ?? null,
    website: place.website ?? null,
    address_line: place.address ?? place.street ?? null,
    city: place.city ?? null,
    postcode: normalisePostcode(place.postalCode),
    region: place.state ?? null,
    google_rating: typeof place.totalScore === 'number' ? place.totalScore : null,
    google_review_count: typeof place.reviewsCount === 'number' ? place.reviewsCount : null,
    google_maps_url: place.url ?? null,
    google_category: place.categoryName ?? place.categories?.[0] ?? null,
    google_description: blurb,
    opening_hours: hours.length > 0 ? JSON.stringify(hours) : null,
    opens_24_7: open24 ? 1 : 0,
    email: pickBusinessEmail(place.emails),
    source: 'apify',
    source_ref: place.searchString ?? null,
  };

  // Social profiles come back as arrays; the first entry is the business page.
  const socials: Array<[keyof ApifyPlace, string, string]> = [
    ['facebooks', 'facebook_url', 'has_facebook'],
    ['instagrams', 'instagram_url', 'has_instagram'],
    ['linkedIns', 'linkedin_url', 'has_linkedin'],
  ];
  for (const [source, urlField, flagField] of socials) {
    const list = place[source] as string[] | undefined;
    const first = list?.find((u) => typeof u === 'string' && u.trim() !== '');
    if (first) {
      values[urlField] = first.trim();
      values[flagField] = 1;
    }
  }

  // Classify from everything Maps gave us, not just the name.
  const text = [
    place.title,
    place.categoryName,
    ...(place.categories ?? []),
    blurb,
    additionalInfoText(place.additionalInfo),
    hours.join('. '),
  ]
    .filter(Boolean)
    .join(' \n ');

  for (const [field, flag] of Object.entries(detectServices(text))) {
    if (flag) values[field] = flag;
  }

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

export interface ApifySearchOptions {
  maxPerQuery?: number;
  /** One location per run, e.g. "Leeds, United Kingdom" or "United Kingdom". */
  location?: string;
  /** Opening hours and the owner blurb only come from the detail page. */
  scrapeDetails?: boolean;
  /** Emails and social profiles, pulled from the business's own website. */
  scrapeContacts?: boolean;
  timeoutMs?: number;
}

export async function searchGoogleMapsViaApify(
  queries: string[],
  options: ApifySearchOptions = {},
): Promise<ApifySearchResult> {
  if (!apifyConfigured()) {
    return { ok: false, message: 'APIFY_TOKEN not set — skipped', places: [], skippedClosed: 0 };
  }

  const actor = env.apifyGoogleMapsActor;
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken)}`;

  const input: Record<string, unknown> = {
    searchStringsArray: queries,
    maxCrawledPlacesPerSearch: options.maxPerQuery ?? 25,
    language: 'en',
    skipClosedPlaces: true,
    // These carry a per-place cost but supply the opening hours, owner blurb,
    // emails and social profiles that the scoring and briefing depend on.
    scrapePlaceDetailPage: options.scrapeDetails ?? true,
    scrapeContacts: options.scrapeContacts ?? true,
    maxReviews: 0,
    maxImages: 0,
    maxQuestions: 0,
  };
  if (options.location) input['locationQuery'] = options.location;
  else input['countryCode'] = 'gb';

  const response = await fetchJson<ApifyPlace[]>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    // Actor runs take minutes, not seconds.
    timeoutMs: options.timeoutMs ?? 30 * 60 * 1000,
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

/** Pulls an existing run's dataset — handy when a run was started elsewhere. */
export async function fetchApifyDataset(datasetId: string, limit = 5000): Promise<ApifySearchResult> {
  if (!apifyConfigured()) {
    return { ok: false, message: 'APIFY_TOKEN not set — skipped', places: [], skippedClosed: 0 };
  }
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&token=${encodeURIComponent(env.apifyToken)}`;
  const response = await fetchJson<ApifyPlace[]>(url, { timeoutMs: 120_000, throttleHost: false });
  if (!response.ok || !Array.isArray(response.data)) {
    return { ok: false, message: response.error ?? 'Could not read the dataset', places: [], skippedClosed: 0 };
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
  return { ok: true, message: `${places.length} place(s) from dataset ${datasetId}`, places, skippedClosed };
}
