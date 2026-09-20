/**
 * Column mapping for CSV imports.
 *
 * Google Maps exports come in many shapes (Apify, Outscraper, Bright Data,
 * PhantomBuster, a hand-built sheet). Rather than demand one format, we match
 * headers against a list of known aliases and let the user override anything we
 * get wrong before the import runs.
 */
export const CANONICAL_FIELDS = [
  'company_name', 'website', 'phone', 'email', 'address_line', 'city', 'postcode', 'region',
  'trade', 'companies_house_number', 'company_status', 'year_established', 'employee_count',
  'owner_name', 'google_place_id', 'google_rating', 'google_review_count', 'google_maps_url',
  'google_category', 'google_description', 'opening_hours', 'opens_24_7',
  'svc_plumbing', 'svc_heating', 'svc_boiler_repair', 'svc_boiler_install', 'svc_emergency',
  'svc_drainage', 'svc_commercial', 'svc_domestic', 'svc_24_7', 'svc_gas_safe', 'svc_bathrooms',
  'svc_other', 'has_google_ads', 'has_facebook', 'has_instagram', 'has_linkedin',
  'has_online_booking', 'has_contact_form', 'booking_software', 'facebook_url', 'instagram_url',
  'linkedin_url', 'notes', 'source_ref',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

const ALIASES: Record<CanonicalField, string[]> = {
  company_name: ['company_name', 'companyname', 'name', 'title', 'business', 'businessname', 'business_name', 'company', 'tradingname'],
  website: ['website', 'websiteurl', 'web', 'site', 'domain', 'homepage', 'website_url', 'siteurl'],
  phone: ['phone', 'phonenumber', 'phone_number', 'telephone', 'tel', 'mobile', 'phoneunformatted', 'internationalphonenumber', 'formattedphonenumber', 'contactnumber'],
  email: ['email', 'emailaddress', 'email_address', 'emails', 'contactemail'],
  address_line: ['address', 'addressline', 'address_line', 'street', 'streetaddress', 'fulladdress', 'address1'],
  city: ['city', 'town', 'locality', 'citytown', 'postaltown'],
  postcode: ['postcode', 'postalcode', 'postal_code', 'zip', 'zipcode', 'post_code'],
  region: ['region', 'county', 'state', 'administrativearea', 'area'],
  trade: ['trade', 'tradetype', 'leadtype', 'businesstype'],
  companies_house_number: ['companies_house_number', 'companynumber', 'company_number', 'companieshouse', 'crn', 'registrationnumber'],
  company_status: ['company_status', 'companystatus', 'status_companies_house'],
  year_established: ['year_established', 'yearestablished', 'founded', 'established', 'incorporated', 'incorporationyear'],
  employee_count: ['employee_count', 'employees', 'employeecount', 'staff', 'headcount', 'engineers', 'teamsize'],
  owner_name: ['owner_name', 'owner', 'ownername', 'director', 'contactname', 'contact', 'principal', 'managingdirector'],
  google_place_id: ['google_place_id', 'placeid', 'place_id', 'googleplaceid', 'fid', 'cid'],
  google_rating: ['google_rating', 'rating', 'totalscore', 'score', 'stars', 'averagerating', 'reviewrating'],
  google_review_count: ['google_review_count', 'reviews', 'reviewscount', 'reviewcount', 'numberofreviews', 'userratingstotal', 'user_ratings_total', 'totalreviews'],
  google_maps_url: ['google_maps_url', 'mapsurl', 'googlemapsurl', 'maps_url', 'googleurl', 'placeurl', 'url', 'link'],
  google_category: ['google_category', 'category', 'categoryname', 'maincategory', 'type', 'types', 'primarycategory'],
  google_description: ['google_description', 'description', 'about', 'editorialsummary', 'snippet'],
  opening_hours: ['opening_hours', 'openinghours', 'hours', 'workinghours', 'businesshours', 'openhours'],
  opens_24_7: ['opens_24_7', 'open24hours', 'is24hours', 'alwaysopen'],
  svc_plumbing: ['svc_plumbing', 'plumbing'],
  svc_heating: ['svc_heating', 'heating'],
  svc_boiler_repair: ['svc_boiler_repair', 'boilerrepair', 'boiler_repair'],
  svc_boiler_install: ['svc_boiler_install', 'boilerinstall', 'boiler_installation', 'boilerinstallation'],
  svc_emergency: ['svc_emergency', 'emergency', 'emergencyservice', 'emergency_callouts'],
  svc_drainage: ['svc_drainage', 'drainage', 'drains'],
  svc_commercial: ['svc_commercial', 'commercial', 'commercialwork'],
  svc_domestic: ['svc_domestic', 'domestic', 'domesticwork', 'residential'],
  svc_24_7: ['svc_24_7', '247', '24_7', 'twentyfourseven', 'service247'],
  svc_gas_safe: ['svc_gas_safe', 'gassafe', 'gas_safe', 'gassaferegistered'],
  svc_bathrooms: ['svc_bathrooms', 'bathrooms', 'bathroominstallation'],
  svc_other: ['svc_other', 'otherservices', 'services', 'servicelist'],
  has_google_ads: ['has_google_ads', 'googleads', 'google_ads', 'adwords', 'runsads', 'ppc'],
  has_facebook: ['has_facebook', 'facebook_detected'],
  has_instagram: ['has_instagram', 'instagram_detected'],
  has_linkedin: ['has_linkedin', 'linkedin_detected'],
  has_online_booking: ['has_online_booking', 'onlinebooking', 'online_booking', 'bookingavailable'],
  has_contact_form: ['has_contact_form', 'contactform', 'contact_form'],
  booking_software: ['booking_software', 'bookingsystem', 'bookingtool'],
  facebook_url: ['facebook_url', 'facebook', 'facebookpage', 'fb', 'facebooks'],
  instagram_url: ['instagram_url', 'instagram', 'instagrams', 'ig'],
  linkedin_url: ['linkedin_url', 'linkedin', 'linkedins'],
  notes: ['notes', 'note', 'comments', 'remarks'],
  source_ref: ['source_ref', 'sourceref', 'searchstring', 'searchquery', 'keyword', 'query', 'externalid', 'id'],
};

const LOOKUP = new Map<string, CanonicalField>();
for (const [field, aliases] of Object.entries(ALIASES) as Array<[CanonicalField, string[]]>) {
  for (const alias of aliases) LOOKUP.set(alias, field);
}

export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-guess mapping from CSV headers to canonical fields. */
export function suggestMapping(headers: string[]): Record<string, CanonicalField | null> {
  const mapping: Record<string, CanonicalField | null> = {};
  const used = new Set<CanonicalField>();
  for (const header of headers) {
    const key = normaliseHeader(header);
    const match = LOOKUP.get(key) ?? null;
    // First header wins when two columns claim the same field (e.g. phone + phoneUnformatted).
    mapping[header] = match && !used.has(match) ? match : null;
    if (match && !used.has(match)) used.add(match);
  }
  return mapping;
}

export function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, CanonicalField | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = row[header];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed === '') continue;
    // Some exports repeat a column; keep the first non-empty value.
    if (out[field] === undefined) out[field] = trimmed;
  }
  return out;
}
