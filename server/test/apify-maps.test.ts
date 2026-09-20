import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'node:test';
import {
  additionalInfoText,
  apifyPlaceToLead,
  openingHoursText,
  pickBusinessEmail,
  type ApifyPlace,
} from '../src/enrichment/apify-maps.js';
import { openTestDatabase, type Db } from '../src/db/index.js';
import { getActiveScoringConfig } from '../src/domain/scoring-store.js';
import { importRecord } from '../src/ingest/csv-import.js';
import { getLead } from '../src/domain/leads.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// Captured from a real compass/crawler-google-places run over Leeds.
const places = JSON.parse(fs.readFileSync(path.join(fixtures, 'apify-places.json'), 'utf8')) as ApifyPlace[];
const [drains, smart, ab] = places as [ApifyPlace, ApifyPlace, ApifyPlace];

describe('pickBusinessEmail', () => {
  it('prefers a role inbox', () => {
    assert.equal(
      pickBusinessEmail(['careers@smartplumbers.co.uk', 'contact@smartplumbers.co.uk']),
      'contact@smartplumbers.co.uk',
    );
    assert.equal(
      pickBusinessEmail(['Scotlandinfo@jndunn.co.uk', 'info@jndunn.co.uk', 'Yorkshireinfo@jndunn.co.uk']),
      'info@jndunn.co.uk',
      'a prefixed address is not the role inbox',
    );
  });

  it('declines to store a named personal inbox', () => {
    assert.equal(pickBusinessEmail(['antony@ableeds.co.uk']), null);
    assert.equal(pickBusinessEmail([]), null);
    assert.equal(pickBusinessEmail(undefined), null);
  });

  it('ignores malformed addresses', () => {
    assert.equal(pickBusinessEmail(['info@', 'not an email']), null);
  });
});

describe('openingHoursText', () => {
  it('flattens the {day, hours} pairs the actor returns', () => {
    assert.deepEqual(openingHoursText(drains.openingHours), ['Monday: Open 24 hours', 'Sunday: Open 24 hours']);
    assert.deepEqual(openingHoursText([]), []);
    assert.deepEqual(openingHoursText(undefined), []);
  });
});

describe('additionalInfoText', () => {
  it('turns Google’s attribute groups into words, keeping only what is true', () => {
    const text = additionalInfoText({
      'Service options': [{ 'Onsite services': true }, { 'Online estimates': false }],
      Offerings: [{ 'Repair services': true }],
    });
    assert.match(text, /Service options: Onsite services/);
    assert.match(text, /Offerings: Repair services/);
    assert.ok(!text.includes('Online estimates'), 'a false attribute is not a signal');
    assert.equal(additionalInfoText(undefined), '');
  });
});

describe('apifyPlaceToLead', () => {
  it('maps a real Maps record onto lead fields', () => {
    const lead = apifyPlaceToLead(drains);
    assert.equal(lead['company_name'], 'Drains First Limited');
    assert.equal(lead['google_place_id'], 'ChIJT5A70ZdYeUgRvCPOaHH5wKc');
    assert.equal(lead['phone'], '+447958784011');
    assert.equal(lead['postcode'], 'LS12 4JG');
    assert.equal(lead['google_rating'], 4.9);
    assert.equal(lead['google_review_count'], 91);
    assert.equal(lead['google_category'], 'Drainage service');
    assert.equal(lead['opens_24_7'], 1, 'read from the opening hours');
  });

  it('reads the owner’s own write-up, which is where the services are described', () => {
    const lead = apifyPlaceToLead(drains);
    assert.match(String(lead['google_description']), /Family run Drainage Company/);
    assert.equal(lead['svc_drainage'], 1);
    assert.equal(lead['svc_emergency'], 1);
    assert.equal(lead['svc_24_7'], 1);
    assert.equal(lead['svc_plumbing'], 1);
  });

  it('classifies from the category list as well as the name', () => {
    const lead = apifyPlaceToLead(smart);
    assert.equal(lead['svc_heating'], 1, '"Heating contractor" is in the category list');
    assert.equal(lead['svc_gas_safe'], undefined, 'nothing says Gas Safe registered, so nothing is claimed');
    assert.equal(lead['svc_emergency'], 1, 'the blurb says same-day repairs for emergencies');
  });

  it('picks up social profiles from the array fields', () => {
    const drainsLead = apifyPlaceToLead(drains);
    assert.equal(drainsLead['facebook_url'], 'https://www.facebook.com/107559905378328');
    assert.equal(drainsLead['has_facebook'], 1);
    assert.equal(drainsLead['has_instagram'], undefined);

    const smartLead = apifyPlaceToLead(smart);
    assert.equal(smartLead['instagram_url'], 'https://www.instagram.com/smartplumbers247');
    assert.equal(smartLead['has_instagram'], 1);
  });

  it('keeps a role email and drops a personal one', () => {
    assert.equal(apifyPlaceToLead(smart)['email'], 'contact@smartplumbers.co.uk');
    assert.equal(apifyPlaceToLead(ab)['email'], undefined);
  });

  it('leaves out what the record does not contain', () => {
    const lead = apifyPlaceToLead(ab);
    assert.equal(lead['google_rating'], undefined);
    assert.equal(lead['google_review_count'], undefined);
    assert.equal(lead['google_description'], undefined);
    assert.equal(lead['opens_24_7'], 0);
    assert.ok(!Object.values(lead).includes(null));
  });
});

describe('importing an Apify record', () => {
  let db: Db;

  beforeEach(() => {
    db = openTestDatabase();
    getActiveScoringConfig(db);
  });

  it('lands a scored, classified, briefed prospect', () => {
    const result = importRecord(
      db,
      apifyPlaceToLead(drains) as Record<string, unknown> & { company_name: string },
      'apify',
      'emergency plumber in Leeds',
    );
    assert.equal(result.created, true);

    const lead = getLead(db, result.id)!;
    assert.equal(lead.phone_e164, '+447958784011');
    assert.equal(lead.region, 'Yorkshire and the Humber', 'derived from the postcode');
    assert.equal(lead.trade, 'drainage');
    assert.equal(lead.svc_emergency, 1);
    assert.equal(lead.opens_24_7, 1);
    assert.ok(lead.score >= 45, `expected a strong score, got ${lead.score}`);
    assert.match(String(lead.summary), /Leeds-based/);
    assert.match(String(lead.summary), /91 Google reviews/);
  });

  it('de-duplicates on the place id when the same business comes back', () => {
    const first = importRecord(db, apifyPlaceToLead(drains) as Record<string, unknown> & { company_name: string }, 'apify');
    const second = importRecord(db, apifyPlaceToLead(drains) as Record<string, unknown> & { company_name: string }, 'apify');
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
  });
});
