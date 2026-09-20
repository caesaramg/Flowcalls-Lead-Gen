/**
 * Companies House public data (https://developer.company-information.service.gov.uk/).
 * Free API, requires a key. Gives the registration number, status, incorporation
 * date and the names of serving directors — all already on the public register.
 *
 * Officer *dates of birth and addresses are deliberately not stored*: we only
 * need a name to open a conversation with. See docs/COMPLIANCE.md.
 */
import { env } from '../lib/env.js';
import { fetchJson } from '../lib/http.js';
import { normalisePostcode } from '../domain/uk.js';

const BASE = 'https://api.company-information.service.gov.uk';

interface SearchItem {
  company_number?: string;
  company_name?: string;
  company_status?: string;
  date_of_creation?: string;
  address?: { postal_code?: string; locality?: string };
  address_snippet?: string;
}

interface Officer {
  name?: string;
  officer_role?: string;
  resigned_on?: string;
  appointed_on?: string;
}

function authHeader(): Record<string, string> {
  const token = Buffer.from(`${env.companiesHouseApiKey}:`).toString('base64');
  return { authorization: `Basic ${token}` };
}

function similarity(a: string, b: string): number {
  const tokenise = (s: string) =>
    new Set(
      s.toLowerCase()
        .replace(/\b(ltd|limited|llp|plc|the|and|&)\b/g, ' ')
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const left = tokenise(a);
  const right = tokenise(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export interface CompaniesHouseResult {
  ok: boolean;
  message: string;
  updates: Record<string, unknown>;
  confidence: number;
}

export function companiesHouseConfigured(): boolean {
  return env.companiesHouseApiKey !== '';
}

export async function enrichFromCompaniesHouse(
  companyName: string,
  postcode?: string | null,
): Promise<CompaniesHouseResult> {
  if (!companiesHouseConfigured()) {
    return { ok: false, message: 'COMPANIES_HOUSE_API_KEY not set — skipped', updates: {}, confidence: 0 };
  }

  const query = encodeURIComponent(companyName);
  const search = await fetchJson<{ items?: SearchItem[] }>(
    `${BASE}/search/companies?q=${query}&items_per_page=20`,
    { headers: authHeader() },
  );
  if (!search.ok || !search.data?.items?.length) {
    return { ok: false, message: search.error ?? 'No Companies House match', updates: {}, confidence: 0 };
  }

  const wantedPostcode = normalisePostcode(postcode);
  const scored = search.data.items
    .map((item) => {
      let confidence = similarity(companyName, item.company_name ?? '');
      const itemPostcode = normalisePostcode(item.address?.postal_code);
      // A postcode match is strong evidence; a mismatch is not disqualifying
      // (registered office often differs from the trading address).
      if (wantedPostcode && itemPostcode === wantedPostcode) confidence += 0.35;
      else if (wantedPostcode && itemPostcode && itemPostcode.split(' ')[0] === wantedPostcode.split(' ')[0]) {
        confidence += 0.15;
      }
      if (item.company_status !== 'active') confidence -= 0.2;
      return { item, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  // Below this we are guessing, and a wrong company number is worse than none.
  if (!best || best.confidence < 0.6 || !best.item.company_number) {
    return {
      ok: false,
      message: `No confident Companies House match (best ${Math.round((best?.confidence ?? 0) * 100)}%)`,
      updates: {},
      confidence: best?.confidence ?? 0,
    };
  }

  const updates: Record<string, unknown> = {
    companies_house_number: best.item.company_number,
    company_status: best.item.company_status ?? null,
  };
  const year = best.item.date_of_creation?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) updates['year_established'] = Number.parseInt(year, 10);

  const officers = await fetchJson<{ items?: Officer[] }>(
    `${BASE}/company/${best.item.company_number}/officers?items_per_page=35`,
    { headers: authHeader() },
  );
  if (officers.ok && officers.data?.items?.length) {
    const serving = officers.data.items
      .filter((o) => !o.resigned_on && /director|member/i.test(o.officer_role ?? ''))
      .sort((a, b) => (a.appointed_on ?? '').localeCompare(b.appointed_on ?? ''));
    const first = serving[0];
    if (first?.name) {
      updates['owner_name'] = first.name;
      updates['owner_role'] = first.officer_role ?? 'director';
    }
  }

  return {
    ok: true,
    message: `Matched ${best.item.company_name} (${best.item.company_number})`,
    updates,
    confidence: Math.min(1, best.confidence),
  };
}
