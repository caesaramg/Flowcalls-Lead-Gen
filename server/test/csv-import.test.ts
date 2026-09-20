import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { openTestDatabase, type Db } from '../src/db/index.js';
import { importCsv, parseCsv } from '../src/ingest/csv-import.js';
import { suggestMapping } from '../src/ingest/csv-mapping.js';
import { getActiveScoringConfig } from '../src/domain/scoring-store.js';
import { buildSearchPlan, SEARCH_TEMPLATES, UK_CITIES } from '../src/ingest/search-plan.js';

let db: Db;

beforeEach(() => {
  db = openTestDatabase();
  getActiveScoringConfig(db);
});

// An Apify "Google Maps" export, as it actually arrives.
const APIFY_CSV = [
  'title,categoryName,address,city,postalCode,state,phone,website,totalScore,reviewsCount,url,placeId,description,openingHours,emails',
  '"Northgate Plumbing & Heating","Plumber","12 Mill Lane, Manchester","Manchester","M20 2RN","Greater Manchester","0161 496 0001","https://northgate.example.com",4.8,412,"https://maps.google.com/?cid=1","PLACE_A","24/7 emergency boiler repairs and installations","[""Monday: Open 24 hours""]","info@northgate.example.com"',
  '"Kestrel Heating Services","Heating contractor","3 High Street, Leeds","Leeds","LS11 9TA","West Yorkshire","0113 496 0002","https://kestrel.example.com",4.4,86,"https://maps.google.com/?cid=2","PLACE_B","Boiler servicing and central heating","[""Monday: 9am-5pm""]",""',
  '"Ashdown Electrical","Electrician","9 Park Road, Leeds","Leeds","LS11 9TB","West Yorkshire","0113 496 0003","https://ashdown.example.com",4.9,150,"https://maps.google.com/?cid=3","PLACE_C","Domestic electrical work","[]",""',
].join('\n');

describe('parseCsv + suggestMapping', () => {
  it('recognises the column names Google Maps exporters use', () => {
    const { headers } = parseCsv(APIFY_CSV);
    const mapping = suggestMapping(headers);
    assert.equal(mapping['title'], 'company_name');
    assert.equal(mapping['totalScore'], 'google_rating');
    assert.equal(mapping['reviewsCount'], 'google_review_count');
    assert.equal(mapping['placeId'], 'google_place_id');
    assert.equal(mapping['url'], 'google_maps_url', 'a bare "url" column is the Maps listing, not the website');
    assert.equal(mapping['website'], 'website');
    assert.equal(mapping['postalCode'], 'postcode');
    assert.equal(mapping['emails'], 'email');
  });

  it('does not map two columns onto the same field', () => {
    const mapping = suggestMapping(['phone', 'phoneUnformatted', 'title']);
    assert.equal(mapping['phone'], 'phone');
    assert.equal(mapping['phoneUnformatted'], null);
  });

  it('handles a hand-made spreadsheet with friendly headers', () => {
    const mapping = suggestMapping(['Business Name', 'Telephone', 'Web', 'Town', 'Post Code', 'Rating', 'Number of reviews']);
    assert.equal(mapping['Business Name'], 'company_name');
    assert.equal(mapping['Telephone'], 'phone');
    assert.equal(mapping['Web'], 'website');
    assert.equal(mapping['Town'], 'city');
    assert.equal(mapping['Post Code'], 'postcode');
    assert.equal(mapping['Rating'], 'google_rating');
    assert.equal(mapping['Number of reviews'], 'google_review_count');
  });
});

describe('importCsv', () => {
  it('imports, normalises, classifies and scores in one pass', () => {
    const report = importCsv(db, APIFY_CSV, { filename: 'maps.csv' });
    assert.equal(report.created, 3);
    assert.equal(report.updated, 0);

    const lead = db.prepare("SELECT * FROM leads WHERE company_name LIKE 'Northgate%'").get() as Record<string, unknown>;
    assert.equal(lead['phone_e164'], '+441614960001');
    assert.equal(lead['postcode'], 'M20 2RN');
    assert.equal(lead['region'], 'North West', 'the source said "Greater Manchester"; regions are standardised');
    assert.equal(lead['google_maps_url'], 'https://maps.google.com/?cid=1');
    assert.equal(lead['google_place_id'], 'PLACE_A');
    assert.equal(lead['svc_emergency'], 1, 'read from the description');
    assert.equal(lead['svc_24_7'], 1);
    assert.equal(lead['svc_boiler_repair'], 1);
    assert.equal(lead['opens_24_7'], 1, 'read from the opening hours');
    assert.equal(lead['trade'], 'plumbing_and_heating', 'the most specific trade the name supports');
    assert.equal(lead['email'], 'info@northgate.example.com');
    assert.ok((lead['score'] as number) > 0);
    assert.ok(String(lead['summary'] ?? '').length > 0, 'a briefing is generated at import time');
  });

  it('can filter out businesses that are not in the target market', () => {
    const report = importCsv(db, APIFY_CSV, { targetTradesOnly: true });
    assert.equal(report.created, 2);
    assert.equal(report.skipped, 1);
    assert.match(report.issues[0]!.reason, /No plumbing\/heating signal/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM leads WHERE company_name LIKE 'Ashdown%'").get() as { n: number }).n, 0);
  });

  it('de-duplicates on re-import instead of creating twins', () => {
    importCsv(db, APIFY_CSV);
    const second = importCsv(db, APIFY_CSV);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 3);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n, 3);
  });

  it('writes nothing on a dry run', () => {
    const report = importCsv(db, APIFY_CSV, { dryRun: true });
    assert.equal(report.dryRun, true);
    assert.equal(report.rowCount, 3);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n, 0);
  });

  it('skips rows with no company name and says which', () => {
    const csv = 'title,phone\n,"0161 496 0009"\n"Real Plumbing Ltd","0161 496 0010"';
    const report = importCsv(db, csv);
    assert.equal(report.created, 1);
    assert.equal(report.skipped, 1);
    assert.equal(report.issues[0]!.row, 2, 'row numbers count the header, like a spreadsheet does');
  });

  it('flags imported leads that are already on the suppression list', () => {
    db.prepare(
      "INSERT INTO suppression_list (phone_e164, reason, source, added_at) VALUES ('+441614960001', 'TPS', 'tps', datetime('now'))",
    ).run();
    const report = importCsv(db, APIFY_CSV);
    assert.equal(report.suppressed, 1);
    const lead = db.prepare("SELECT do_not_call FROM leads WHERE company_name LIKE 'Northgate%'").get() as { do_not_call: number };
    assert.equal(lead.do_not_call, 1);
  });

  it('respects an explicit column mapping over the guess', () => {
    const csv = 'Name,Mobile,Notes\n"Brookvale Plumbing","07700 900123","Met at the merchants"';
    const report = importCsv(db, csv, {
      mapping: { Name: 'company_name', Mobile: 'phone', Notes: 'notes' },
    });
    assert.equal(report.created, 1);
    const lead = db.prepare('SELECT * FROM leads').get() as Record<string, unknown>;
    assert.equal(lead['phone_e164'], '+447700900123');
    assert.equal(lead['notes'], 'Met at the merchants');
  });
});

describe('buildSearchPlan', () => {
  it('covers the query templates from the brief', () => {
    assert.deepEqual([...SEARCH_TEMPLATES], [
      'plumber in {city}',
      'emergency plumber in {city}',
      'heating engineer in {city}',
      'boiler repair in {city}',
      'plumbing and heating in {city}',
    ]);
  });

  it('plans enough searches to reach the target after de-duplication', () => {
    const plan = buildSearchPlan({ target: 1000 });
    assert.ok(plan.estimatedUnique >= 1000, `expected >= 1000 unique, planned ${plan.estimatedUnique}`);
    assert.ok(plan.searches.length > 0);
    assert.ok(plan.searches.every((s) => !s.query.includes('{city}')));
  });

  it('can be narrowed to chosen cities', () => {
    const plan = buildSearchPlan({ cities: ['Leeds', 'Sheffield'], target: 50 });
    assert.deepEqual([...new Set(plan.searches.map((s) => s.city))].sort(), ['Leeds', 'Sheffield']);
  });

  it('has no duplicate city entries in the territory list', () => {
    const names = UK_CITIES.map((c) => c.name);
    assert.equal(names.length, new Set(names).size);
  });
});
