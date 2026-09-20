/**
 * Keyword classification of trade + services from whatever text we hold
 * (business name, Google category, description, website copy).
 *
 * Deliberately conservative: a signal is only set when a phrase actually
 * appears. Nothing here fabricates a service the business never mentioned.
 */
import type { Trade } from '../domain/types.js';

export interface ServiceSignals {
  svc_plumbing?: number;
  svc_heating?: number;
  svc_boiler_repair?: number;
  svc_boiler_install?: number;
  svc_emergency?: number;
  svc_drainage?: number;
  svc_commercial?: number;
  svc_domestic?: number;
  svc_24_7?: number;
  svc_gas_safe?: number;
  svc_bathrooms?: number;
}

type Matcher = { field: keyof ServiceSignals; patterns: RegExp[] };

const MATCHERS: Matcher[] = [
  { field: 'svc_emergency', patterns: [/\bemergenc/i, /\bout[ -]of[ -]hours\b/i, /\bsame[ -]day\b/i, /\bcall[ -]?outs?\b/i, /\brapid response\b/i, /\b1 ?hour response\b/i] },
  { field: 'svc_24_7', patterns: [/\b24\s*[\/-]\s*7\b/i, /\b24 ?hours?\b/i, /\b24hr\b/i, /\baround the clock\b/i, /\bday (?:or|and) night\b/i, /\bopen 24\b/i] },
  { field: 'svc_boiler_repair', patterns: [/\bboiler repair/i, /\bboiler breakdown/i, /\bboiler servic/i, /\bboiler fault/i, /\bno hot water\b/i] },
  { field: 'svc_boiler_install', patterns: [/\bboiler install/i, /\bnew boiler/i, /\bboiler replace/i, /\bboiler upgrade/i, /\bcombi (?:boiler )?install/i, /\bboiler quote/i] },
  { field: 'svc_heating', patterns: [/\bheating\b/i, /\bcentral heating\b/i, /\bradiator/i, /\bunderfloor heating\b/i, /\bheat pump/i, /\bpower ?flush/i] },
  { field: 'svc_plumbing', patterns: [/\bplumb/i, /\bleak/i, /\bburst pipe/i, /\btaps?\b/i, /\btoilet/i, /\bcylinder/i] },
  { field: 'svc_drainage', patterns: [/\bdrain/i, /\bsewer/i, /\bjetting\b/i, /\bcctv survey/i, /\bblocked (?:toilet|sink|drain)/i] },
  { field: 'svc_commercial', patterns: [/\bcommercial\b/i, /\blandlord/i, /\bfacilit(?:y|ies) management\b/i, /\boffice(?:s)? and\b/i, /\bbusiness premises\b/i] },
  { field: 'svc_domestic', patterns: [/\bdomestic\b/i, /\bresidential\b/i, /\bhome ?owners?\b/i, /\bhousehold\b/i] },
  { field: 'svc_gas_safe', patterns: [/\bgas[ -]?safe\b/i, /\bgas safe registered\b/i, /\bgas certificate/i, /\bCP12\b/i] },
  { field: 'svc_bathrooms', patterns: [/\bbathroom/i, /\bwet ?room/i, /\bshower install/i, /\ben[ -]?suite\b/i] },
];

export function detectServices(text: string): ServiceSignals {
  const signals: ServiceSignals = {};
  if (!text) return signals;
  for (const matcher of MATCHERS) {
    if (matcher.patterns.some((p) => p.test(text))) signals[matcher.field] = 1;
  }
  // A boiler install/repair specialist is by definition doing heating work.
  if (signals.svc_boiler_repair || signals.svc_boiler_install) signals.svc_heating = 1;
  return signals;
}

const TRADE_RULES: Array<{ trade: Trade; patterns: RegExp[] }> = [
  { trade: 'emergency_plumber', patterns: [/\bemergency plumb/i, /\b24 ?(?:hour|hr) plumb/i] },
  { trade: 'plumbing_and_heating', patterns: [/\bplumbing (?:and|&|\+) heating\b/i, /\bheating (?:and|&|\+) plumbing\b/i] },
  { trade: 'boiler_repair', patterns: [/\bboiler (?:repair|servic|install|special)/i, /\bboiler (?:company|engineer|expert)/i] },
  { trade: 'gas_engineer', patterns: [/\bgas engineer/i, /\bgas fitter/i, /\bgas services\b/i] },
  { trade: 'heating_engineer', patterns: [/\bheating engineer/i, /\bheating (?:company|services|specialist|contractor)/i, /\bhvac\b/i] },
  { trade: 'drainage', patterns: [/\bdrain(?:age)?\b/i, /\bsewer/i] },
  { trade: 'plumber', patterns: [/\bplumb/i] },
];

/**
 * Returns the most specific trade the text supports, or null when nothing
 * matches — an unknown trade is better than a wrong one.
 */
export function detectTrade(text: string): Trade | null {
  if (!text) return null;
  for (const rule of TRADE_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.trade;
  }
  return null;
}

/** True when a Google category / business text is plausibly in our target market. */
export function isTargetTrade(text: string): boolean {
  return /plumb|heating|boiler|gas engineer|gas fitter|drain|hvac|central heating/i.test(text ?? '');
}

/**
 * Rough engineer-count estimate from copy such as "our team of 12 engineers".
 * Returns null unless an explicit number is stated — never a guess from revenue
 * or review counts.
 */
export function detectEmployeeCount(text: string): { count: number; basis: string } | null {
  if (!text) return null;
  const patterns: Array<[RegExp, string]> = [
    [/\bteam of (?:over |more than |around |approx(?:imately)? )?(\d{1,3})\b/i, 'website copy: "team of N"'],
    [/\b(\d{1,3})\s+(?:fully )?(?:qualified |experienced |gas safe )?(?:engineers|plumbers|technicians)\b/i, 'website copy: "N engineers"'],
    [/\b(\d{1,3})\s+(?:strong )?(?:staff|employees)\b/i, 'website copy: "N staff"'],
  ];
  for (const [pattern, basis] of patterns) {
    const m = pattern.exec(text);
    const raw = m?.[1];
    if (!raw) continue;
    const count = Number.parseInt(raw, 10);
    if (Number.isFinite(count) && count > 0 && count < 500) return { count, basis };
  }
  return null;
}
