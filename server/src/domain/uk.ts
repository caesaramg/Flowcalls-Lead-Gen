/**
 * UK postcode area -> region. Heuristic: postcode areas do not map perfectly onto
 * ITL/administrative regions, so this is a "good enough for territory planning"
 * lookup, not an authoritative geography. Region is always overwritable by hand.
 */
const POSTCODE_AREA_REGION: Record<string, string> = {
  AB: 'Scotland', DD: 'Scotland', DG: 'Scotland', EH: 'Scotland', FK: 'Scotland',
  G: 'Scotland', HS: 'Scotland', IV: 'Scotland', KA: 'Scotland', KW: 'Scotland',
  KY: 'Scotland', ML: 'Scotland', PA: 'Scotland', PH: 'Scotland', TD: 'Scotland', ZE: 'Scotland',

  BT: 'Northern Ireland',

  CF: 'Wales', LD: 'Wales', LL: 'Wales', NP: 'Wales', SA: 'Wales',

  DH: 'North East', DL: 'North East', NE: 'North East', SR: 'North East', TS: 'North East',

  BB: 'North West', BL: 'North West', CA: 'North West', CH: 'North West', CW: 'North West',
  FY: 'North West', L: 'North West', LA: 'North West', M: 'North West', OL: 'North West',
  PR: 'North West', SK: 'North West', WA: 'North West', WN: 'North West',

  BD: 'Yorkshire and the Humber', DN: 'Yorkshire and the Humber', HD: 'Yorkshire and the Humber',
  HG: 'Yorkshire and the Humber', HU: 'Yorkshire and the Humber', HX: 'Yorkshire and the Humber',
  LS: 'Yorkshire and the Humber', S: 'Yorkshire and the Humber', WF: 'Yorkshire and the Humber',
  YO: 'Yorkshire and the Humber',

  DE: 'East Midlands', LE: 'East Midlands', LN: 'East Midlands', NG: 'East Midlands',
  NN: 'East Midlands',

  B: 'West Midlands', CV: 'West Midlands', DY: 'West Midlands', HR: 'West Midlands',
  ST: 'West Midlands', SY: 'West Midlands', TF: 'West Midlands', WR: 'West Midlands',
  WS: 'West Midlands', WV: 'West Midlands',

  AL: 'East of England', CB: 'East of England', CM: 'East of England', CO: 'East of England',
  IP: 'East of England', LU: 'East of England', NR: 'East of England', PE: 'East of England',
  SG: 'East of England', SS: 'East of England', WD: 'East of England',

  BR: 'London', CR: 'London', E: 'London', EC: 'London', EN: 'London', HA: 'London',
  IG: 'London', N: 'London', NW: 'London', RM: 'London', SE: 'London', SM: 'London',
  SW: 'London', TW: 'London', UB: 'London', W: 'London', WC: 'London',

  BN: 'South East', CT: 'South East', DA: 'South East', GU: 'South East', HP: 'South East',
  KT: 'South East', ME: 'South East', MK: 'South East', OX: 'South East', PO: 'South East',
  RG: 'South East', RH: 'South East', SL: 'South East', SO: 'South East', TN: 'South East',

  BA: 'South West', BH: 'South West', BS: 'South West', DT: 'South West', EX: 'South West',
  GL: 'South West', PL: 'South West', SN: 'South West', SP: 'South West', TA: 'South West',
  TQ: 'South West', TR: 'South West',

  GY: 'Channel Islands', JE: 'Channel Islands', IM: 'Isle of Man',
};

/** The region names this system uses. Anything else gets normalised onto one. */
export const UK_REGIONS: readonly string[] = [...new Set(Object.values(POSTCODE_AREA_REGION))];

export function isCanonicalRegion(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && UK_REGIONS.includes(value);
}

const POSTCODE_RE = /^([A-Z]{1,2})([0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})$/;

/** Returns a tidied "SW1A 1AA" style postcode, or null if it does not parse. */
export function normalisePostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = POSTCODE_RE.exec(compact);
  if (!m) return null;
  return `${m[1]}${m[2]} ${m[3]}`;
}

export function postcodeArea(postcode: string | null | undefined): string | null {
  const tidy = normalisePostcode(postcode);
  if (!tidy) return null;
  const m = /^([A-Z]{1,2})/.exec(tidy);
  return m?.[1] ?? null;
}

export function regionFromPostcode(postcode: string | null | undefined): string | null {
  const area = postcodeArea(postcode);
  if (!area) return null;
  return POSTCODE_AREA_REGION[area] ?? null;
}

/**
 * Normalise a UK phone number to E.164 (+44…). Returns null when the input is
 * not a plausible UK number — we would rather store nothing than store junk.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+440')) digits = `+44${digits.slice(4)}`;
  else if (digits.startsWith('0044')) digits = `+44${digits.slice(4)}`;
  else if (digits.startsWith('44') && !digits.startsWith('+')) digits = `+${digits}`;
  else if (digits.startsWith('0')) digits = `+44${digits.slice(1)}`;
  else if (!digits.startsWith('+')) return null;

  if (!digits.startsWith('+44')) return null;
  const national = digits.slice(3);
  if (!/^\d{9,10}$/.test(national)) return null;
  return `+44${national}`;
}

/** Human-friendly UK display format, e.g. "0161 123 4567" / "07700 900123". */
export function formatPhoneForDisplay(e164: string | null | undefined): string | null {
  if (!e164 || !e164.startsWith('+44')) return e164 ?? null;
  const national = `0${e164.slice(3)}`;
  if (national.startsWith('07')) return `${national.slice(0, 5)} ${national.slice(5)}`;
  if (national.startsWith('0800') || national.startsWith('0808')) {
    return `${national.slice(0, 4)} ${national.slice(4)}`;
  }
  // 2-digit area codes (020, 023, 024, 028, 029)
  if (/^0(2\d)/.test(national)) return `${national.slice(0, 3)} ${national.slice(3, 7)} ${national.slice(7)}`;
  // 3-digit area codes (011x, 01x1)
  if (/^0(11\d|1\d1)/.test(national)) return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
  return `${national.slice(0, 5)} ${national.slice(5)}`;
}

/** 03/08 numbers and non-geographic ranges usually mean a call-handling setup already. */
export function phoneKind(e164: string | null | undefined): 'mobile' | 'geographic' | 'freephone' | 'non-geographic' | 'unknown' {
  if (!e164 || !e164.startsWith('+44')) return 'unknown';
  const n = `0${e164.slice(3)}`;
  if (n.startsWith('07')) return 'mobile';
  if (n.startsWith('0800') || n.startsWith('0808')) return 'freephone';
  if (n.startsWith('03') || n.startsWith('084') || n.startsWith('087') || n.startsWith('09')) return 'non-geographic';
  if (n.startsWith('01') || n.startsWith('02')) return 'geographic';
  return 'unknown';
}

/** Lowercased registrable host, without "www." — used for dedupe and display. */
export function normaliseDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function normaliseWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Drop the boilerplate so "ABC Plumbing Ltd." and "ABC Plumbing Limited" collapse. */
export function canonicalCompanyName(name: string): string {
  return slugify(
    name
      .toLowerCase()
      // Dots and apostrophes vanish so "A.B.C." collapses to "abc"; the rest
      // become separators so "Smith & Sons" keeps its word boundaries.
      .replace(/[.']/g, '')
      .replace(/\b(ltd|limited|llp|plc|co|company|services|service|uk)\b/g, ' ')
      .replace(/[,&"()]/g, ' '),
  );
}
