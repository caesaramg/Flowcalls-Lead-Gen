import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { analyseHtml, interestingLinks, websiteQualityScore } from '../src/enrichment/website-signals.js';
import { detectEmployeeCount, detectServices, detectTrade, isTargetTrade } from '../src/enrichment/classify.js';
import { parseRobots } from '../src/lib/http.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

describe('analyseHtml', () => {
  const signals = analyseHtml(read('plumber-site.html'), 'https://northgate-plumbing.example.com/');

  it('detects Google Ads without confusing it with Analytics', () => {
    assert.equal(signals.hasGoogleAds, true);
    assert.equal(signals.hasGoogleAnalytics, true);

    const plain = analyseHtml(
      '<html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script></head><body></body></html>',
      'https://x.example.com/',
    );
    assert.equal(plain.hasGoogleAds, false, 'a GA4 tag on its own is not Google Ads');
    assert.equal(plain.hasGoogleAnalytics, true);
  });

  it('identifies the booking software by vendor', () => {
    assert.equal(signals.hasOnlineBooking, true);
    assert.equal(signals.bookingSoftware, 'Commusoft');
  });

  it('finds an enquiry form but ignores the site search', () => {
    assert.equal(signals.hasContactForm, true);
  });

  it('collects social profiles and skips share links', () => {
    assert.equal(signals.facebookUrl, 'https://www.facebook.com/northgateplumbing');
    assert.equal(signals.instagramUrl, 'https://www.instagram.com/northgateplumbing');
    assert.equal(signals.linkedinUrl, null);
  });

  it('prefers a role inbox over any other address', () => {
    assert.equal(signals.emails[0], 'info@northgate-plumbing.example.com');
  });

  it('reads the services straight off the page', () => {
    assert.equal(signals.services.svc_emergency, 1);
    assert.equal(signals.services.svc_24_7, 1);
    assert.equal(signals.services.svc_boiler_repair, 1);
    assert.equal(signals.services.svc_boiler_install, 1);
    assert.equal(signals.services.svc_drainage, 1);
    assert.equal(signals.services.svc_gas_safe, 1);
    assert.equal(signals.services.svc_commercial, 1);
  });

  it('picks up a stated team size', () => {
    assert.deepEqual(signals.employeeCount, { count: 12, basis: 'website copy: "team of N"' });
  });

  it('detects live chat', () => {
    assert.equal(signals.hasLiveChat, true);
    assert.equal(signals.liveChatVendor, 'tawk');
  });

  it('reports nothing it cannot see', () => {
    const basic = analyseHtml(read('basic-site.html'), 'https://kestrel.example.com/');
    assert.equal(basic.hasGoogleAds, false);
    assert.equal(basic.hasOnlineBooking, false);
    assert.equal(basic.hasContactForm, false);
    assert.equal(basic.facebookUrl, null);
    assert.deepEqual(basic.emails, []);
    assert.equal(basic.employeeCount, null);
    assert.equal(basic.services.svc_plumbing, 1);
    assert.equal(basic.services.svc_emergency, undefined);
  });

  it('spots a parked domain', () => {
    assert.equal(analyseHtml(read('parked-site.html'), 'https://x.example.com/').looksParked, true);
    assert.equal(signals.looksParked, false);
  });
});

describe('websiteQualityScore', () => {
  it('rates a well-built site far above a bare one', () => {
    const good = websiteQualityScore({
      https: true, responseMs: 800, pagesFetched: 4, bytes: 90_000,
      signals: analyseHtml(read('plumber-site.html'), 'https://northgate-plumbing.example.com/'),
    });
    const basic = websiteQualityScore({
      https: false, responseMs: 4000, pagesFetched: 1, bytes: 900,
      signals: analyseHtml(read('basic-site.html'), 'https://kestrel.example.com/'),
    });
    assert.ok(good >= 80, `expected a high score, got ${good}`);
    assert.ok(basic <= 20, `expected a low score, got ${basic}`);
    assert.ok(good <= 100);
  });

  it('scores a parked domain as effectively nothing', () => {
    const parked = websiteQualityScore({
      https: true, responseMs: 100, pagesFetched: 1, bytes: 400,
      signals: analyseHtml(read('parked-site.html'), 'https://x.example.com/'),
    });
    assert.equal(parked, 5);
  });
});

describe('interestingLinks', () => {
  it('follows only relevant same-origin pages', () => {
    const links = interestingLinks(read('plumber-site.html'), 'https://northgate-plumbing.example.com/', 4);
    assert.ok(links.includes('https://northgate-plumbing.example.com/about'));
    assert.ok(links.includes('https://northgate-plumbing.example.com/services/boiler-installation'));
    assert.ok(!links.some((l) => l.includes('facebook.com')), 'stays on the business’s own site');
    assert.ok(links.length <= 4);
  });
});

describe('classification', () => {
  it('picks the most specific trade it can support', () => {
    assert.equal(detectTrade('ABC Emergency Plumbing Ltd'), 'emergency_plumber');
    assert.equal(detectTrade('Smith Plumbing and Heating'), 'plumbing_and_heating');
    assert.equal(detectTrade('Boiler repair specialists'), 'boiler_repair');
    assert.equal(detectTrade('Gas engineer, Leeds'), 'gas_engineer');
    assert.equal(detectTrade('Bob the plumber'), 'plumber');
    assert.equal(detectTrade('Greenfield Landscaping'), null, 'unknown beats wrong');
  });

  it('screens out businesses outside the target market', () => {
    assert.equal(isTargetTrade('Plumber'), true);
    assert.equal(isTargetTrade('Heating contractor'), true);
    assert.equal(isTargetTrade('Electrician'), false);
    assert.equal(isTargetTrade('Hair salon'), false);
  });

  it('only reports an employee count that is actually stated', () => {
    assert.deepEqual(detectEmployeeCount('We have 8 qualified engineers on the road'), {
      count: 8, basis: 'website copy: "N engineers"',
    });
    assert.equal(detectEmployeeCount('We are a large, established company'), null);
    assert.equal(detectEmployeeCount('Over 3000 jobs completed'), null, 'job counts are not staff counts');
  });

  it('infers heating work from boiler work', () => {
    assert.equal(detectServices('boiler repairs').svc_heating, 1);
  });
});

describe('parseRobots', () => {
  it('collects the disallow rules that apply to everyone', () => {
    const rules = parseRobots(['User-agent: *', 'Disallow: /admin', 'Disallow: /cart', '', 'User-agent: BadBot', 'Disallow: /'].join('\n'));
    assert.deepEqual(rules, ['/admin', '/cart']);
  });

  it('ignores comments and blank directives', () => {
    assert.deepEqual(parseRobots('# comment\nUser-agent: *\nDisallow:\nAllow: /'), []);
  });
});
