import { env } from '../lib/env.js';
import { fetchText, isAllowedByRobots } from '../lib/http.js';
import { normalisePhone } from '../domain/uk.js';
import { analyseHtml, interestingLinks, websiteQualityScore, type WebsiteSignals } from './website-signals.js';

export interface WebsiteEnrichment {
  ok: boolean;
  message: string;
  finalUrl: string | null;
  pagesFetched: number;
  updates: Record<string, unknown>;
  signals: WebsiteSignals | null;
}

function mergeSignals(pages: WebsiteSignals[]): WebsiteSignals {
  const base = pages[0]!;
  const merged: WebsiteSignals = { ...base, services: { ...base.services }, signals: [...base.signals] };

  for (const page of pages.slice(1)) {
    merged.hasGoogleAds ||= page.hasGoogleAds;
    merged.hasGoogleAnalytics ||= page.hasGoogleAnalytics;
    merged.hasGoogleTagManager ||= page.hasGoogleTagManager;
    merged.hasMetaPixel ||= page.hasMetaPixel;
    merged.hasContactForm ||= page.hasContactForm;
    merged.hasOnlineBooking ||= page.hasOnlineBooking;
    merged.hasLiveChat ||= page.hasLiveChat;
    merged.bookingSoftware ??= page.bookingSoftware;
    merged.liveChatVendor ??= page.liveChatVendor;
    merged.facebookUrl ??= page.facebookUrl;
    merged.instagramUrl ??= page.instagramUrl;
    merged.linkedinUrl ??= page.linkedinUrl;
    merged.employeeCount ??= page.employeeCount;
    merged.emails = [...new Set([...merged.emails, ...page.emails])];
    merged.phones = [...new Set([...merged.phones, ...page.phones])];
    merged.hasStructuredData ||= page.hasStructuredData;
    merged.hasOpenGraph ||= page.hasOpenGraph;
    merged.hasViewport ||= page.hasViewport;
    merged.looksParked &&= page.looksParked;
    for (const [key, value] of Object.entries(page.services)) {
      if (value) merged.services[key as keyof typeof merged.services] = 1;
    }
    for (const signal of page.signals) if (!merged.signals.includes(signal)) merged.signals.push(signal);
  }
  return merged;
}

/**
 * Fetches the homepage plus a few obviously relevant pages and turns them into
 * marketing/service signals. Honours robots.txt and a per-host crawl delay.
 */
export async function enrichFromWebsite(website: string): Promise<WebsiteEnrichment> {
  const empty: WebsiteEnrichment = {
    ok: false, message: '', finalUrl: null, pagesFetched: 0, updates: {}, signals: null,
  };

  let start: string;
  try {
    start = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).toString();
  } catch {
    return { ...empty, message: 'Invalid website URL' };
  }

  if (!(await isAllowedByRobots(start))) {
    return { ...empty, message: 'Blocked by robots.txt — not crawled' };
  }

  const home = await fetchText(start, { maxBytes: 1_500_000 });
  if (!home.ok || !home.body) {
    return { ...empty, message: home.error ?? `Homepage returned HTTP ${home.status}` };
  }

  const analysed: WebsiteSignals[] = [analyseHtml(home.body, home.url, env.userAgent)];
  let bytes = home.body.length;
  let pagesFetched = 1;

  const links = interestingLinks(home.body, home.url, Math.max(0, env.maxPagesPerSite - 1));
  for (const link of links) {
    if (!(await isAllowedByRobots(link))) continue;
    const page = await fetchText(link, { maxBytes: 1_000_000 });
    if (!page.ok || !page.body) continue;
    analysed.push(analyseHtml(page.body, page.url, env.userAgent));
    bytes += page.body.length;
    pagesFetched += 1;
  }

  const signals = mergeSignals(analysed);
  const quality = websiteQualityScore({
    https: home.url.startsWith('https://'),
    responseMs: home.elapsedMs,
    pagesFetched,
    bytes,
    signals,
  });

  const updates: Record<string, unknown> = {
    has_website: 1,
    website: home.url.replace(/\/$/, ''),
    has_google_ads: signals.hasGoogleAds ? 1 : 0,
    has_contact_form: signals.hasContactForm ? 1 : 0,
    has_online_booking: signals.hasOnlineBooking ? 1 : 0,
    has_live_chat: signals.hasLiveChat ? 1 : 0,
    website_quality_score: quality,
    marketing_signals: JSON.stringify(signals.signals),
  };

  if (signals.bookingSoftware) updates['booking_software'] = signals.bookingSoftware;
  if (signals.facebookUrl) {
    updates['facebook_url'] = signals.facebookUrl;
    updates['has_facebook'] = 1;
  }
  if (signals.instagramUrl) {
    updates['instagram_url'] = signals.instagramUrl;
    updates['has_instagram'] = 1;
  }
  if (signals.linkedinUrl) {
    updates['linkedin_url'] = signals.linkedinUrl;
    updates['has_linkedin'] = 1;
  }
  // Business contact addresses only — a named personal inbox is more personal
  // data than we need for B2B prospecting (see docs/COMPLIANCE.md).
  const roleEmail = signals.emails.find((e) => /^(?:info|enquiries|enquiry|contact|hello|admin|office|sales|accounts|service|bookings|support|mail)@/i.test(e));
  if (roleEmail) updates['email'] = roleEmail;

  const phone = signals.phones.map((p) => normalisePhone(p)).find(Boolean);
  if (phone) updates['phone'] = phone;

  for (const [field, value] of Object.entries(signals.services)) {
    if (value) updates[field] = 1;
  }
  if (signals.employeeCount) {
    updates['employee_count'] = signals.employeeCount.count;
    updates['employee_count_basis'] = signals.employeeCount.basis;
  }

  return {
    ok: true,
    message: signals.looksParked
      ? `Fetched ${pagesFetched} page(s) — site looks parked or unfinished`
      : `Fetched ${pagesFetched} page(s)`,
    finalUrl: home.url,
    pagesFetched,
    updates,
    signals,
  };
}
