/**
 * Prospect summary + suggested opening line.
 *
 * Hard rule: every clause here is built from a stored fact. If a fact is
 * missing, the clause is dropped — nothing is guessed, softened or invented.
 * Negative statements ("no online booking found") are only made when the
 * website enrichment actually ran, which `website_quality_score` records.
 */
import { TRADE_LABELS, type LeadRow, type Trade } from './types.js';
import { formatPhoneForDisplay } from './uk.js';

export interface Personalisation {
  summary: string;
  openingLine: string;
  talkingPoints: string[];
}

function list(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

function tradePhrase(trade: Trade | null): string {
  switch (trade) {
    case 'heating_engineer':
      return 'heating company';
    case 'plumbing_and_heating':
      return 'plumbing and heating company';
    case 'boiler_repair':
      return 'boiler repair company';
    case 'emergency_plumber':
      return 'emergency plumbing company';
    case 'gas_engineer':
      return 'gas engineering company';
    case 'drainage':
      return 'drainage company';
    case 'plumber':
      return 'plumbing company';
    default:
      return 'business';
  }
}

function firstName(fullName: string | null): string | null {
  if (!fullName) return null;
  // Companies House returns "SMITH, John Andrew" — take the given name.
  const commaForm = /^([^,]+),\s*(.+)$/.exec(fullName.trim());
  const given = commaForm ? commaForm[2]! : fullName.trim();
  const first = given.split(/\s+/)[0] ?? '';
  if (first.length < 2) return null;
  // Normalise ALL-CAPS register formatting.
  return first[0]!.toUpperCase() + first.slice(1).toLowerCase();
}

function timeOfDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

function dateShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

const TEST_CALL_PHRASE: Record<string, string> = {
  no_answer: 'went unanswered',
  voicemail: 'went to voicemail',
  engaged: 'hit an engaged tone',
  answered_human: 'was answered by the business',
  human_receptionist: 'was picked up by a receptionist or answering service',
  automated_receptionist: 'was met by an automated menu',
  booking_taken: 'ended with a booking being taken',
  number_invalid: 'reached an invalid number',
  other: 'was logged with a custom outcome',
};

function serviceClaims(lead: LeadRow): string[] {
  const claims: string[] = [];
  if (lead.svc_emergency) claims.push('emergency callouts');
  if (lead.svc_24_7 || lead.opens_24_7) claims.push('24/7 availability');
  if (lead.svc_boiler_repair) claims.push('boiler repairs');
  if (lead.svc_boiler_install) claims.push('boiler installations');
  if (lead.svc_drainage) claims.push('drainage work');
  if (lead.svc_commercial) claims.push('commercial work');
  return claims;
}

export function buildPersonalisation(lead: LeadRow): Personalisation {
  const siteAnalysed = lead.website_quality_score !== null;
  const sentences: string[] = [];

  // --- Who they are ---------------------------------------------------
  const where = lead.city ? `${lead.city}-based ` : '';
  let opener = `${lead.company_name} is a ${where}${tradePhrase(lead.trade)}`;
  const googleBits: string[] = [];
  if (typeof lead.google_review_count === 'number') {
    googleBits.push(`${lead.google_review_count.toLocaleString('en-GB')} Google review${lead.google_review_count === 1 ? '' : 's'}`);
  }
  if (typeof lead.google_rating === 'number') googleBits.push(`a ${lead.google_rating.toFixed(1)} rating`);
  if (googleBits.length > 0) opener += ` with ${list(googleBits)}`;
  sentences.push(`${opener}.`);

  // --- Size / registration --------------------------------------------
  const sizeBits: string[] = [];
  if (typeof lead.employee_count === 'number') {
    sizeBits.push(`around ${lead.employee_count} ${lead.employee_count === 1 ? 'engineer' : 'engineers'}`);
  }
  if (lead.year_established) sizeBits.push(`trading since ${lead.year_established}`);
  if (sizeBits.length > 0) sentences.push(`Records show ${list(sizeBits)}.`);

  // --- What they sell --------------------------------------------------
  const claims = serviceClaims(lead);
  if (claims.length > 0) sentences.push(`They advertise ${list(claims)}.`);

  // --- How they market -------------------------------------------------
  if (lead.has_google_ads) {
    sentences.push('Google Ads detected — they are paying for the calls that come in.');
  } else if (siteAnalysed) {
    sentences.push('No Google Ads tracking found on their website.');
  }

  if (lead.has_online_booking) {
    const tool = lead.booking_software ? ` (${lead.booking_software})` : '';
    sentences.push(`Online booking is in place${tool}.`);
  } else if (siteAnalysed) {
    sentences.push('No online booking system found, so enquiries have to come by phone or form.');
  }

  // --- What the phone test showed --------------------------------------
  if (lead.test_call_attempted && lead.test_call_outcome) {
    const phrase = TEST_CALL_PHRASE[lead.test_call_outcome] ?? 'was logged';
    const at = timeOfDay(lead.test_call_at);
    const on = dateShort(lead.test_call_at);
    const when = at && on ? ` at ${at} on ${on}` : at ? ` at ${at}` : '';
    const ooh = lead.test_call_ooh_failure ? ' (outside their advertised hours)' : '';
    sentences.push(`Manual test call${when}${ooh} ${phrase}.`);
  }

  // --- Talking points ---------------------------------------------------
  const talkingPoints: string[] = [];
  if (lead.test_call_outcome === 'no_answer') talkingPoints.push('Their phone went unanswered when you tested it.');
  if (lead.test_call_outcome === 'voicemail') talkingPoints.push('Test call went to voicemail — likely lost jobs.');
  if (lead.test_call_ooh_failure) talkingPoints.push('Out-of-hours calls are not being picked up.');
  if (lead.test_call_poor_handling) talkingPoints.push('Call handling was poor when someone did answer.');
  if (lead.has_google_ads) talkingPoints.push('Paying for Google Ads clicks that turn into missed calls.');
  if (lead.svc_emergency || lead.svc_24_7 || lead.opens_24_7) {
    talkingPoints.push('Advertises emergency / 24-7 cover, so every missed call is an urgent job.');
  }
  if ((lead.google_review_count ?? 0) >= 100) {
    talkingPoints.push(`${lead.google_review_count} reviews — established demand, high call volume.`);
  }
  if (siteAnalysed && !lead.has_online_booking) talkingPoints.push('The phone is their only real booking channel.');

  return {
    summary: sentences.join(' '),
    openingLine: buildOpeningLine(lead),
    talkingPoints,
  };
}

export function buildOpeningLine(lead: LeadRow): string {
  const name = firstName(lead.owner_name);
  const greeting = name ? `Hi ${name}, ` : 'Hi, ';
  const intro = name
    ? `I came across ${lead.company_name}`
    : `is that ${lead.company_name}? I came across you online`;

  // Strongest observed hook first.
  let hook: string;
  if (lead.svc_emergency && lead.svc_boiler_repair) {
    hook = 'and noticed you offer emergency boiler callouts';
  } else if (lead.svc_emergency) {
    hook = 'and noticed you offer emergency callouts';
  } else if (lead.svc_24_7 || lead.opens_24_7) {
    hook = 'and noticed you cover 24/7 callouts';
  } else if (lead.has_google_ads) {
    hook = 'and noticed you are running Google Ads for plumbing and heating work';
  } else if ((lead.google_review_count ?? 0) >= 100) {
    hook = `and noticed you have over ${Math.floor((lead.google_review_count ?? 0) / 100) * 100} Google reviews`;
  } else if (lead.city) {
    hook = `while looking at plumbing and heating firms around ${lead.city}`;
  } else {
    hook = 'while looking at plumbing and heating firms';
  }

  const ask = 'I was looking at how you handle calls when you are on the tools and wanted to ask you something…';
  return `${greeting}${intro} ${hook}. ${ask}`;
}

/** One-line reason shown in the call queue. */
export function callReason(lead: LeadRow): string {
  if (lead.follow_up_date) return `Follow-up due ${dateShort(lead.follow_up_date) ?? lead.follow_up_date}`;
  if (lead.test_call_outcome === 'no_answer') return 'Test call went unanswered';
  if (lead.test_call_outcome === 'voicemail') return 'Test call went to voicemail';
  if (lead.test_call_ooh_failure) return 'Out-of-hours calls not answered';
  if (lead.has_google_ads) return 'Running Google Ads';
  if ((lead.google_review_count ?? 0) >= 100) return `${lead.google_review_count} Google reviews`;
  if (lead.svc_emergency) return 'Advertises emergency callouts';
  return `Score ${lead.score}`;
}

export function displayPhone(lead: LeadRow): string | null {
  return formatPhoneForDisplay(lead.phone_e164) ?? lead.phone;
}

export { TRADE_LABELS };
