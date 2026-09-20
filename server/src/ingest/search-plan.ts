/**
 * Territory planning for lead acquisition.
 *
 * The goal is ~1,000 well-enriched prospects, not the largest possible list, so
 * the plan spreads searches across cities and query templates and tells you how
 * many results to pull per search to hit the target.
 */
export interface UkCity {
  name: string;
  region: string;
  /** Rough size tier; drives how many results are worth pulling per search. */
  tier: 1 | 2 | 3;
}

export const UK_CITIES: UkCity[] = [
  { name: 'London', region: 'London', tier: 1 },
  { name: 'Birmingham', region: 'West Midlands', tier: 1 },
  { name: 'Manchester', region: 'North West', tier: 1 },
  { name: 'Leeds', region: 'Yorkshire and the Humber', tier: 1 },
  { name: 'Glasgow', region: 'Scotland', tier: 1 },
  { name: 'Liverpool', region: 'North West', tier: 1 },
  { name: 'Sheffield', region: 'Yorkshire and the Humber', tier: 1 },
  { name: 'Bristol', region: 'South West', tier: 1 },
  { name: 'Edinburgh', region: 'Scotland', tier: 1 },
  { name: 'Leicester', region: 'East Midlands', tier: 1 },
  { name: 'Newcastle upon Tyne', region: 'North East', tier: 1 },
  { name: 'Nottingham', region: 'East Midlands', tier: 1 },
  { name: 'Cardiff', region: 'Wales', tier: 1 },
  { name: 'Belfast', region: 'Northern Ireland', tier: 1 },
  { name: 'Coventry', region: 'West Midlands', tier: 2 },
  { name: 'Bradford', region: 'Yorkshire and the Humber', tier: 2 },
  { name: 'Stoke-on-Trent', region: 'West Midlands', tier: 2 },
  { name: 'Wolverhampton', region: 'West Midlands', tier: 2 },
  { name: 'Plymouth', region: 'South West', tier: 2 },
  { name: 'Southampton', region: 'South East', tier: 2 },
  { name: 'Portsmouth', region: 'South East', tier: 2 },
  { name: 'Reading', region: 'South East', tier: 2 },
  { name: 'Derby', region: 'East Midlands', tier: 2 },
  { name: 'Aberdeen', region: 'Scotland', tier: 2 },
  { name: 'Dundee', region: 'Scotland', tier: 2 },
  { name: 'Swansea', region: 'Wales', tier: 2 },
  { name: 'Newport', region: 'Wales', tier: 2 },
  { name: 'Milton Keynes', region: 'South East', tier: 2 },
  { name: 'Northampton', region: 'East Midlands', tier: 2 },
  { name: 'Luton', region: 'East of England', tier: 2 },
  { name: 'Norwich', region: 'East of England', tier: 2 },
  { name: 'Ipswich', region: 'East of England', tier: 2 },
  { name: 'Peterborough', region: 'East of England', tier: 2 },
  { name: 'Cambridge', region: 'East of England', tier: 2 },
  { name: 'Oxford', region: 'South East', tier: 2 },
  { name: 'Brighton', region: 'South East', tier: 2 },
  { name: 'Bournemouth', region: 'South West', tier: 2 },
  { name: 'Exeter', region: 'South West', tier: 2 },
  { name: 'Gloucester', region: 'South West', tier: 2 },
  { name: 'Swindon', region: 'South West', tier: 2 },
  { name: 'Bath', region: 'South West', tier: 3 },
  { name: 'York', region: 'Yorkshire and the Humber', tier: 2 },
  { name: 'Hull', region: 'Yorkshire and the Humber', tier: 2 },
  { name: 'Huddersfield', region: 'Yorkshire and the Humber', tier: 2 },
  { name: 'Wakefield', region: 'Yorkshire and the Humber', tier: 3 },
  { name: 'Doncaster', region: 'Yorkshire and the Humber', tier: 2 },
  { name: 'Rotherham', region: 'Yorkshire and the Humber', tier: 3 },
  { name: 'Barnsley', region: 'Yorkshire and the Humber', tier: 3 },
  { name: 'Middlesbrough', region: 'North East', tier: 2 },
  { name: 'Sunderland', region: 'North East', tier: 2 },
  { name: 'Durham', region: 'North East', tier: 3 },
  { name: 'Darlington', region: 'North East', tier: 3 },
  { name: 'Bolton', region: 'North West', tier: 2 },
  { name: 'Stockport', region: 'North West', tier: 2 },
  { name: 'Oldham', region: 'North West', tier: 3 },
  { name: 'Rochdale', region: 'North West', tier: 3 },
  { name: 'Warrington', region: 'North West', tier: 2 },
  { name: 'Wigan', region: 'North West', tier: 3 },
  { name: 'Preston', region: 'North West', tier: 2 },
  { name: 'Blackpool', region: 'North West', tier: 2 },
  { name: 'Blackburn', region: 'North West', tier: 3 },
  { name: 'Chester', region: 'North West', tier: 3 },
  { name: 'Lancaster', region: 'North West', tier: 3 },
  { name: 'Carlisle', region: 'North West', tier: 3 },
  { name: 'Salford', region: 'North West', tier: 2 },
  { name: 'Birkenhead', region: 'North West', tier: 3 },
  { name: 'St Helens', region: 'North West', tier: 3 },
  { name: 'Solihull', region: 'West Midlands', tier: 3 },
  { name: 'Walsall', region: 'West Midlands', tier: 3 },
  { name: 'Dudley', region: 'West Midlands', tier: 3 },
  { name: 'West Bromwich', region: 'West Midlands', tier: 3 },
  { name: 'Telford', region: 'West Midlands', tier: 3 },
  { name: 'Shrewsbury', region: 'West Midlands', tier: 3 },
  { name: 'Worcester', region: 'West Midlands', tier: 3 },
  { name: 'Hereford', region: 'West Midlands', tier: 3 },
  { name: 'Redditch', region: 'West Midlands', tier: 3 },
  { name: 'Nuneaton', region: 'West Midlands', tier: 3 },
  { name: 'Lincoln', region: 'East Midlands', tier: 3 },
  { name: 'Mansfield', region: 'East Midlands', tier: 3 },
  { name: 'Chesterfield', region: 'East Midlands', tier: 3 },
  { name: 'Loughborough', region: 'East Midlands', tier: 3 },
  { name: 'Kettering', region: 'East Midlands', tier: 3 },
  { name: 'Corby', region: 'East Midlands', tier: 3 },
  { name: 'Colchester', region: 'East of England', tier: 3 },
  { name: 'Chelmsford', region: 'East of England', tier: 3 },
  { name: 'Basildon', region: 'East of England', tier: 3 },
  { name: 'Southend-on-Sea', region: 'East of England', tier: 2 },
  { name: 'Watford', region: 'East of England', tier: 3 },
  { name: 'St Albans', region: 'East of England', tier: 3 },
  { name: 'Stevenage', region: 'East of England', tier: 3 },
  { name: 'Bedford', region: 'East of England', tier: 3 },
  { name: "King's Lynn", region: 'East of England', tier: 3 },
  { name: 'Great Yarmouth', region: 'East of England', tier: 3 },
  { name: 'Croydon', region: 'London', tier: 2 },
  { name: 'Bromley', region: 'London', tier: 3 },
  { name: 'Ealing', region: 'London', tier: 3 },
  { name: 'Enfield', region: 'London', tier: 3 },
  { name: 'Romford', region: 'London', tier: 3 },
  { name: 'Harrow', region: 'London', tier: 3 },
  { name: 'Kingston upon Thames', region: 'London', tier: 3 },
  { name: 'Slough', region: 'South East', tier: 3 },
  { name: 'Guildford', region: 'South East', tier: 3 },
  { name: 'Woking', region: 'South East', tier: 3 },
  { name: 'Basingstoke', region: 'South East', tier: 3 },
  { name: 'Crawley', region: 'South East', tier: 3 },
  { name: 'Maidstone', region: 'South East', tier: 3 },
  { name: 'Canterbury', region: 'South East', tier: 3 },
  { name: 'Chatham', region: 'South East', tier: 3 },
  { name: 'Eastbourne', region: 'South East', tier: 3 },
  { name: 'Hastings', region: 'South East', tier: 3 },
  { name: 'Worthing', region: 'South East', tier: 3 },
  { name: 'High Wycombe', region: 'South East', tier: 3 },
  { name: 'Aylesbury', region: 'South East', tier: 3 },
  { name: 'Poole', region: 'South West', tier: 3 },
  { name: 'Torquay', region: 'South West', tier: 3 },
  { name: 'Taunton', region: 'South West', tier: 3 },
  { name: 'Cheltenham', region: 'South West', tier: 3 },
  { name: 'Salisbury', region: 'South West', tier: 3 },
  { name: 'Truro', region: 'South West', tier: 3 },
  { name: 'Weston-super-Mare', region: 'South West', tier: 3 },
  { name: 'Wrexham', region: 'Wales', tier: 3 },
  { name: 'Bangor', region: 'Wales', tier: 3 },
  { name: 'Bridgend', region: 'Wales', tier: 3 },
  { name: 'Paisley', region: 'Scotland', tier: 3 },
  { name: 'Inverness', region: 'Scotland', tier: 3 },
  { name: 'Stirling', region: 'Scotland', tier: 3 },
  { name: 'Perth', region: 'Scotland', tier: 3 },
  { name: 'Falkirk', region: 'Scotland', tier: 3 },
  { name: 'Londonderry', region: 'Northern Ireland', tier: 3 },
  { name: 'Lisburn', region: 'Northern Ireland', tier: 3 },
];

/** Query templates, in the order given in the brief. */
export const SEARCH_TEMPLATES = [
  'plumber in {city}',
  'emergency plumber in {city}',
  'heating engineer in {city}',
  'boiler repair in {city}',
  'plumbing and heating in {city}',
] as const;

export interface PlannedSearch {
  query: string;
  city: string;
  region: string;
  template: string;
  maxResults: number;
}

export interface SearchPlan {
  target: number;
  searches: PlannedSearch[];
  estimatedResults: number;
  /** Maps overlap heavily between templates — the estimate allows for it. */
  assumedDuplicateRate: number;
  estimatedUnique: number;
}

const RESULTS_BY_TIER: Record<1 | 2 | 3, number> = { 1: 20, 2: 15, 3: 10 };

export function buildSearchPlan(options: {
  cities?: string[];
  templates?: string[];
  target?: number;
} = {}): SearchPlan {
  const target = options.target ?? 1000;
  const templates = options.templates?.length ? options.templates : [...SEARCH_TEMPLATES];
  const cityPool = options.cities?.length
    ? UK_CITIES.filter((c) => options.cities!.some((name) => name.toLowerCase() === c.name.toLowerCase()))
    : UK_CITIES;

  const duplicateRate = 0.45;
  const searches: PlannedSearch[] = [];
  let estimated = 0;
  // When the caller names the cities, that list is the plan — cover all of them.
  // Only the automatic sweep stops once the target is within reach.
  const stopAtTarget = !options.cities?.length;

  for (const city of cityPool) {
    for (const template of templates) {
      const maxResults = RESULTS_BY_TIER[city.tier];
      searches.push({
        query: template.replace('{city}', city.name),
        city: city.name,
        region: city.region,
        template,
        maxResults,
      });
      estimated += maxResults;
      if (stopAtTarget && estimated * (1 - duplicateRate) >= target) break;
    }
    if (stopAtTarget && estimated * (1 - duplicateRate) >= target) break;
  }

  return {
    target,
    searches,
    estimatedResults: estimated,
    assumedDuplicateRate: duplicateRate,
    estimatedUnique: Math.round(estimated * (1 - duplicateRate)),
  };
}
