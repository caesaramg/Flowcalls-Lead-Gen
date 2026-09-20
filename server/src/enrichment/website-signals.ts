/**
 * Pure signal detection over fetched HTML. Kept free of I/O so it can be
 * unit-tested against fixtures.
 */
import * as cheerio from 'cheerio';
import { detectEmployeeCount, detectServices, type ServiceSignals } from './classify.js';

export interface BookingVendor {
  code: string;
  label: string;
  patterns: RegExp[];
}

/** Booking/job-management tools common in UK trades. */
export const BOOKING_VENDORS: BookingVendor[] = [
  { code: 'commusoft', label: 'Commusoft', patterns: [/commusoft\.co/i] },
  { code: 'servicem8', label: 'ServiceM8', patterns: [/servicem8\.com/i] },
  { code: 'payaca', label: 'Payaca', patterns: [/payaca\.com/i] },
  { code: 'tradify', label: 'Tradify', patterns: [/tradifyhq\.com/i, /tradify\.co/i] },
  { code: 'jobber', label: 'Jobber', patterns: [/getjobber\.com/i, /jobber\.com/i] },
  { code: 'simpro', label: 'Simpro', patterns: [/simprogroup\.com/i, /simpro\.co/i] },
  { code: 'powered_now', label: 'Powered Now', patterns: [/powerednow\.com/i] },
  { code: 'yourtradebase', label: 'YourTradebase', patterns: [/yourtradebase\.com/i] },
  { code: 'klipboard', label: 'Klipboard', patterns: [/klipboard\.io/i] },
  { code: 'joblogic', label: 'Joblogic', patterns: [/joblogic\.com/i] },
  { code: 'calendly', label: 'Calendly', patterns: [/calendly\.com/i] },
  { code: 'acuity', label: 'Acuity Scheduling', patterns: [/acuityscheduling\.com/i] },
  { code: 'setmore', label: 'Setmore', patterns: [/setmore\.com/i] },
  { code: 'housecall_pro', label: 'Housecall Pro', patterns: [/housecallpro\.com/i] },
  { code: 'checkatrade_book', label: 'Checkatrade booking', patterns: [/checkatrade\.com\/.*\/book/i] },
];

const LIVE_CHAT_PATTERNS: Array<[string, RegExp]> = [
  ['tawk', /tawk\.to/i],
  ['intercom', /intercom(?:cdn)?\.(?:io|com)/i],
  ['crisp', /crisp\.chat/i],
  ['livechat', /livechatinc\.com/i],
  ['zendesk', /(?:zdassets|zopim)\.com/i],
  ['hubspot_chat', /js\.hs-scripts\.com/i],
  ['whatsapp', /(?:wa\.me|api\.whatsapp\.com\/send)/i],
  ['facebook_messenger', /m\.me\//i],
];

export interface WebsiteSignals {
  hasGoogleAds: boolean;
  hasGoogleAnalytics: boolean;
  hasGoogleTagManager: boolean;
  hasMetaPixel: boolean;
  hasContactForm: boolean;
  hasOnlineBooking: boolean;
  bookingSoftware: string | null;
  hasLiveChat: boolean;
  liveChatVendor: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  emails: string[];
  phones: string[];
  services: ServiceSignals;
  employeeCount: { count: number; basis: string } | null;
  signals: string[];
  /** Raw visible text, capped — used for classification only. */
  text: string;
  title: string | null;
  metaDescription: string | null;
  hasViewport: boolean;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
  looksParked: boolean;
}

const GOOGLE_ADS_PATTERNS: RegExp[] = [
  /googleadservices\.com/i,
  /googletagmanager\.com\/gtag\/js\?id=AW-/i,
  /gtag\(\s*['"]config['"]\s*,\s*['"]AW-/i,
  /google_conversion_id/i,
  /googleads\.g\.doubleclick\.net/i,
  /\/pagead\/conversion/i,
  /AW-\d{9,}/,
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ROLE_EMAIL = /^(?:info|enquiries|enquiry|contact|hello|admin|office|sales|accounts|service|bookings|support|mail)@/i;

/**
 * Addresses that are not the business's: website-template placeholders, error
 * reporters, and — because sites do echo it back in debug output — whatever
 * address our own crawler advertises in its user agent.
 */
const JUNK_EMAIL_DOMAIN = /@(?:[a-z0-9-]*\.)?(?:sample|your|my|test|dummy|placeholder|lorem)?(?:domain|site|website|company|business|email)\.|@(?:example|test|localhost|invalid)\.|@(?:sentry|wixpress|squarespace|godaddy)\./i;

function isJunkEmail(value: string, ownContact: string | null): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return true;
  if (/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(value)) return true;
  if (JUNK_EMAIL_DOMAIN.test(value)) return true;
  if (ownContact && value === ownContact) return true;
  return false;
}

/** The contact address our own user agent advertises, so we never scrape it back. */
function ownContactEmail(userAgent: string): string | null {
  const match = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(userAgent);
  return match ? match[0].toLowerCase() : null;
}

function absolute(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function analyseHtml(html: string, pageUrl: string, userAgent = ''): WebsiteSignals {
  const $ = cheerio.load(html);
  $('script, style, noscript').each((_, el) => {
    // Keep script src/inline text for signal detection, but drop it from visible text.
    $(el).attr('data-flowcalls-script', '1');
  });

  const rawHtml = html;
  const text = $('body').clone().find('script, style, noscript').remove().end().text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60_000);

  const signals: string[] = [];
  const hasGoogleAds = GOOGLE_ADS_PATTERNS.some((p) => p.test(rawHtml));
  if (hasGoogleAds) signals.push('google_ads');

  const hasGoogleAnalytics = /googletagmanager\.com\/gtag\/js\?id=G-|google-analytics\.com|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i.test(rawHtml);
  if (hasGoogleAnalytics) signals.push('google_analytics');

  const hasGoogleTagManager = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/.test(rawHtml);
  if (hasGoogleTagManager) signals.push('google_tag_manager');

  const hasMetaPixel = /connect\.facebook\.net\/.*\/fbevents\.js|fbq\(\s*['"]init['"]/i.test(rawHtml);
  if (hasMetaPixel) signals.push('meta_pixel');

  // --- Social profiles -------------------------------------------------
  let facebookUrl: string | null = null;
  let instagramUrl: string | null = null;
  let linkedinUrl: string | null = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const url = absolute(pageUrl, href);
    if (!url) return;
    if (!facebookUrl && /facebook\.com\//i.test(url) && !/sharer|share\.php|plugins/i.test(url)) facebookUrl = url;
    if (!instagramUrl && /instagram\.com\//i.test(url)) instagramUrl = url;
    if (!linkedinUrl && /linkedin\.com\/(?:company|in)\//i.test(url) && !/sharing|shareArticle/i.test(url)) linkedinUrl = url;
  });
  if (facebookUrl) signals.push('facebook');
  if (instagramUrl) signals.push('instagram');
  if (linkedinUrl) signals.push('linkedin');

  // --- Booking + chat ---------------------------------------------------
  const vendor = BOOKING_VENDORS.find((v) => v.patterns.some((p) => p.test(rawHtml)));
  const bookingLinkText = $('a')
    .toArray()
    .map((el) => `${$(el).text()} ${$(el).attr('href') ?? ''}`)
    .join(' ');
  const bookingWording = /\b(?:book (?:online|now|a (?:job|visit|slot|appointment))|online booking|request an appointment|schedule (?:a )?(?:visit|appointment))\b/i
    .test(bookingLinkText);
  const hasOnlineBooking = Boolean(vendor) || bookingWording;
  if (hasOnlineBooking) signals.push('online_booking');

  const chat = LIVE_CHAT_PATTERNS.find(([, p]) => p.test(rawHtml));
  if (chat) signals.push(`live_chat:${chat[0]}`);

  // --- Contact form -----------------------------------------------------
  let hasContactForm = false;
  $('form').each((_, el) => {
    const form = $(el);
    const action = (form.attr('action') ?? '').toLowerCase();
    const idClass = `${form.attr('id') ?? ''} ${form.attr('class') ?? ''}`.toLowerCase();
    const fields = form.find('input, textarea').toArray().map((f) => {
      const input = $(f);
      return `${input.attr('type') ?? ''} ${input.attr('name') ?? ''} ${input.attr('id') ?? ''}`.toLowerCase();
    }).join(' ');
    const isSearch = /search/.test(`${action} ${idClass} ${fields}`) && !/contact|enquir/.test(`${action} ${idClass}`);
    if (isSearch) return;
    if (/email|tel|phone|message|enquir|contact|name/.test(fields) || /contact|enquir/.test(`${action} ${idClass}`)) {
      hasContactForm = true;
    }
  });
  if (hasContactForm) signals.push('contact_form');

  // --- Contact details --------------------------------------------------
  const emails = new Set<string>();
  const ownContact = ownContactEmail(userAgent);
  // mailto links and page text go through the same filter — a placeholder in a
  // theme's "contact us" link is not a real address.
  $('a[href^="mailto:"]').each((_, el) => {
    const value = ($(el).attr('href') ?? '').replace(/^mailto:/i, '').split('?')[0]!.trim().toLowerCase();
    if (value && !isJunkEmail(value, ownContact)) emails.add(value);
  });
  for (const match of rawHtml.match(EMAIL_RE) ?? []) {
    const value = match.toLowerCase();
    if (isJunkEmail(value, ownContact)) continue;
    emails.add(value);
  }

  const phones = new Set<string>();
  $('a[href^="tel:"]').each((_, el) => {
    const value = ($(el).attr('href') ?? '').replace(/^tel:/i, '').trim();
    if (value) phones.add(value);
  });

  const title = $('head > title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? null;
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  const hasOpenGraph = $('meta[property^="og:"]').length > 0;

  const combinedText = [title, metaDescription, text].filter(Boolean).join(' \n ');
  const looksParked =
    text.length < 400 &&
    /(?:domain (?:is )?for sale|under construction|coming soon|website is being built|parked)/i.test(combinedText);

  return {
    hasGoogleAds,
    hasGoogleAnalytics,
    hasGoogleTagManager,
    hasMetaPixel,
    hasContactForm,
    hasOnlineBooking,
    bookingSoftware: vendor?.label ?? null,
    hasLiveChat: Boolean(chat),
    liveChatVendor: chat?.[0] ?? null,
    facebookUrl,
    instagramUrl,
    linkedinUrl,
    emails: [...emails].sort((a, b) => Number(ROLE_EMAIL.test(b)) - Number(ROLE_EMAIL.test(a))),
    phones: [...phones],
    services: detectServices(combinedText),
    employeeCount: detectEmployeeCount(combinedText),
    signals,
    text,
    title,
    metaDescription,
    hasViewport,
    hasStructuredData,
    hasOpenGraph,
    looksParked,
  };
}

export interface QualityInput {
  https: boolean;
  responseMs: number;
  pagesFetched: number;
  bytes: number;
  signals: WebsiteSignals;
}

/**
 * 0-100 "is this a business that invests in its web presence?" heuristic.
 * It is a prioritisation aid, not an audit.
 */
export function websiteQualityScore(input: QualityInput): number {
  const s = input.signals;
  if (s.looksParked) return 5;

  let score = 0;
  if (input.https) score += 10;
  if (input.responseMs > 0 && input.responseMs < 1500) score += 10;
  else if (input.responseMs < 3500) score += 5;
  if (s.hasViewport) score += 15;
  if (s.title && s.title.length >= 15) score += 10;
  if (s.metaDescription && s.metaDescription.length >= 40) score += 10;
  if (s.hasStructuredData) score += 10;
  if (s.hasOpenGraph) score += 5;
  if (s.hasContactForm) score += 10;
  if (s.hasGoogleAnalytics || s.hasGoogleTagManager) score += 10;
  if (input.pagesFetched > 1) score += 5;
  if (input.bytes > 15_000) score += 5;

  return Math.max(0, Math.min(100, score));
}

/** Candidate pages worth a look beyond the homepage. */
export function interestingLinks(html: string, pageUrl: string, limit: number): string[] {
  const $ = cheerio.load(html);
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return null;
    }
  })();
  if (!origin) return [];

  const wanted = /(contact|about|services|emergency|24-?7|boiler|book|pricing|our-team|team)/i;
  const found = new Set<string>();

  $('a[href]').each((_, el) => {
    if (found.size >= limit) return;
    const href = $(el).attr('href') ?? '';
    if (/^(?:mailto|tel|javascript):/i.test(href)) return;
    const url = absolute(pageUrl, href);
    if (!url || !url.startsWith(origin)) return;
    const clean = url.split('#')[0]!;
    if (clean === pageUrl || clean === `${pageUrl}/`) return;
    if (!wanted.test(clean) && !wanted.test($(el).text())) return;
    if (/\.(?:pdf|jpe?g|png|gif|svg|zip|docx?)$/i.test(clean)) return;
    found.add(clean);
  });

  return [...found].slice(0, limit);
}
