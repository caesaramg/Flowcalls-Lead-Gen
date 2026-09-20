import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalCompanyName,
  formatPhoneForDisplay,
  normaliseDomain,
  normalisePhone,
  normalisePostcode,
  normaliseWebsite,
  phoneKind,
  regionFromPostcode,
} from '../src/domain/uk.js';

describe('normalisePhone', () => {
  it('accepts the formats a UK business actually publishes', () => {
    assert.equal(normalisePhone('0161 496 0001'), '+441614960001');
    assert.equal(normalisePhone('0161-496-0001'), '+441614960001');
    assert.equal(normalisePhone('(0161) 4960001'), '+441614960001');
    assert.equal(normalisePhone('+44 161 496 0001'), '+441614960001');
    assert.equal(normalisePhone('0044 161 496 0001'), '+441614960001');
    assert.equal(normalisePhone('+44 (0)161 496 0001'), '+441614960001');
    assert.equal(normalisePhone('07700 900123'), '+447700900123');
  });

  it('returns null rather than storing junk', () => {
    assert.equal(normalisePhone(''), null);
    assert.equal(normalisePhone(null), null);
    assert.equal(normalisePhone('call us!'), null);
    assert.equal(normalisePhone('12345'), null);
    assert.equal(normalisePhone('+1 415 555 0100'), null, 'non-UK numbers are out of scope');
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats by number range', () => {
    assert.equal(formatPhoneForDisplay('+442079460001'), '020 7946 0001');
    assert.equal(formatPhoneForDisplay('+441614960001'), '0161 496 0001');
    assert.equal(formatPhoneForDisplay('+447700900123'), '07700 900123');
    assert.equal(formatPhoneForDisplay('+448001234567'), '0800 1234567');
  });
});

describe('phoneKind', () => {
  it('distinguishes a personal mobile from a switchboard', () => {
    assert.equal(phoneKind('+447700900123'), 'mobile');
    assert.equal(phoneKind('+441614960001'), 'geographic');
    assert.equal(phoneKind('+442079460001'), 'geographic');
    assert.equal(phoneKind('+448001234567'), 'freephone');
    assert.equal(phoneKind('+443001234567'), 'non-geographic');
  });
});

describe('normalisePostcode', () => {
  it('tidies whatever spacing the source used', () => {
    assert.equal(normalisePostcode('m20 2rn'), 'M20 2RN');
    assert.equal(normalisePostcode('M202RN'), 'M20 2RN');
    assert.equal(normalisePostcode(' sw1a 1aa '), 'SW1A 1AA');
    assert.equal(normalisePostcode('EH11 4BQ'), 'EH11 4BQ');
  });

  it('rejects things that are not postcodes', () => {
    assert.equal(normalisePostcode('Manchester'), null);
    assert.equal(normalisePostcode(''), null);
    assert.equal(normalisePostcode(undefined), null);
  });
});

describe('regionFromPostcode', () => {
  it('maps postcode areas onto sales regions', () => {
    assert.equal(regionFromPostcode('M20 2RN'), 'North West');
    assert.equal(regionFromPostcode('EH11 4BQ'), 'Scotland');
    assert.equal(regionFromPostcode('CF24 1NY'), 'Wales');
    assert.equal(regionFromPostcode('BT1 5GS'), 'Northern Ireland');
    assert.equal(regionFromPostcode('SW1A 1AA'), 'London');
    assert.equal(regionFromPostcode('LS11 9TA'), 'Yorkshire and the Humber');
  });

  it('returns null when it cannot tell', () => {
    assert.equal(regionFromPostcode('not a postcode'), null);
  });
});

describe('website and domain normalisation', () => {
  it('normalises for display and for de-duplication', () => {
    assert.equal(normaliseDomain('https://WWW.Example.co.uk/contact'), 'example.co.uk');
    assert.equal(normaliseDomain('example.co.uk'), 'example.co.uk');
    assert.equal(normaliseWebsite('example.co.uk/'), 'https://example.co.uk');
    assert.equal(normaliseWebsite('http://example.co.uk/page#top'), 'http://example.co.uk/page');
    assert.equal(normaliseWebsite('javascript:alert(1)'), null);
    assert.equal(normaliseDomain(''), null);
  });
});

describe('canonicalCompanyName', () => {
  it('collapses the legal-suffix noise that stops duplicates matching', () => {
    assert.equal(canonicalCompanyName('ABC Plumbing Ltd'), canonicalCompanyName('ABC Plumbing Limited'));
    assert.equal(canonicalCompanyName('A.B.C. Plumbing'), canonicalCompanyName('ABC Plumbing'));
    assert.notEqual(canonicalCompanyName('ABC Plumbing'), canonicalCompanyName('XYZ Plumbing'));
  });
});
