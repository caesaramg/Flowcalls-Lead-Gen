import type { Db } from '../db/index.js';
import type { LeadRow } from './types.js';
import { normalisePhone } from './uk.js';

export const SORTABLE_COLUMNS = {
  score: 'score',
  company_name: 'company_name',
  city: 'city',
  google_rating: 'google_rating',
  google_review_count: 'google_review_count',
  employee_count: 'employee_count',
  created_at: 'created_at',
  updated_at: 'updated_at',
  follow_up_date: 'follow_up_date',
  last_called_at: 'last_called_at',
  status: 'status',
} as const;
export type SortColumn = keyof typeof SORTABLE_COLUMNS;

export interface LeadFilters {
  q?: string;
  status?: string[];
  band?: string[];
  city?: string[];
  region?: string[];
  trade?: string[];
  scoreMin?: number;
  scoreMax?: number;
  ratingMin?: number;
  reviewsMin?: number;
  reviewsMax?: number;
  employeesMin?: number;
  employeesMax?: number;
  emergency?: boolean;
  service247?: boolean;
  googleAds?: boolean;
  hasWebsite?: boolean;
  hasOnlineBooking?: boolean;
  hasEmail?: boolean;
  testCalled?: boolean;
  testOutcome?: string[];
  callOutcome?: string[];
  /** 'exclude' (default) hides do-not-call leads, 'only' shows just those. */
  doNotCall?: 'exclude' | 'include' | 'only';
  followUpDue?: boolean;
  followUpFrom?: string;
  followUpTo?: string;
  addedFrom?: string;
  addedTo?: string;
  sort?: SortColumn;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

interface WhereParts {
  clauses: string[];
  params: unknown[];
}

function inClause(column: string, values: string[] | undefined, parts: WhereParts): void {
  if (!values || values.length === 0) return;
  parts.clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`);
  parts.params.push(...values);
}

function boolClause(column: string, value: boolean | undefined, parts: WhereParts): void {
  if (value === undefined) return;
  parts.clauses.push(`${column} = ?`);
  parts.params.push(value ? 1 : 0);
}

export function buildWhere(filters: LeadFilters): WhereParts {
  const parts: WhereParts = { clauses: [], params: [] };

  if (filters.q && filters.q.trim() !== '') {
    const term = `%${filters.q.trim().toLowerCase()}%`;
    const phone = normalisePhone(filters.q);
    parts.clauses.push(`(
      LOWER(company_name) LIKE ?
      OR LOWER(COALESCE(city, '')) LIKE ?
      OR LOWER(COALESCE(postcode, '')) LIKE ?
      OR LOWER(COALESCE(website, '')) LIKE ?
      OR LOWER(COALESCE(owner_name, '')) LIKE ?
      OR COALESCE(phone_e164, '') = COALESCE(?, '~none~')
    )`);
    parts.params.push(term, term, term, term, term, phone);
  }

  inClause('status', filters.status, parts);
  inClause('score_band', filters.band, parts);
  inClause('city', filters.city, parts);
  inClause('region', filters.region, parts);
  inClause('trade', filters.trade, parts);
  inClause('test_call_outcome', filters.testOutcome, parts);
  inClause('last_call_outcome', filters.callOutcome, parts);

  const ranges: Array<[string, number | undefined, '>=' | '<=']> = [
    ['score', filters.scoreMin, '>='],
    ['score', filters.scoreMax, '<='],
    ['google_rating', filters.ratingMin, '>='],
    ['google_review_count', filters.reviewsMin, '>='],
    ['google_review_count', filters.reviewsMax, '<='],
    ['employee_count', filters.employeesMin, '>='],
    ['employee_count', filters.employeesMax, '<='],
  ];
  for (const [column, value, op] of ranges) {
    if (value === undefined || Number.isNaN(value)) continue;
    parts.clauses.push(`${column} ${op} ?`);
    parts.params.push(value);
  }

  if (filters.emergency !== undefined) {
    if (filters.emergency) parts.clauses.push('svc_emergency = 1');
    else parts.clauses.push('svc_emergency = 0');
  }
  if (filters.service247 !== undefined) {
    if (filters.service247) parts.clauses.push('(svc_24_7 = 1 OR opens_24_7 = 1)');
    else parts.clauses.push('(svc_24_7 = 0 AND opens_24_7 = 0)');
  }
  boolClause('has_google_ads', filters.googleAds, parts);
  boolClause('has_website', filters.hasWebsite, parts);
  boolClause('has_online_booking', filters.hasOnlineBooking, parts);
  boolClause('test_call_attempted', filters.testCalled, parts);

  if (filters.hasEmail !== undefined) {
    parts.clauses.push(filters.hasEmail ? "COALESCE(email, '') != ''" : "COALESCE(email, '') = ''");
  }

  const dnc = filters.doNotCall ?? 'exclude';
  if (dnc === 'exclude') parts.clauses.push('do_not_call = 0');
  else if (dnc === 'only') parts.clauses.push('do_not_call = 1');

  if (filters.followUpDue) {
    parts.clauses.push('follow_up_date IS NOT NULL AND DATE(follow_up_date) <= DATE(?)');
    parts.params.push(new Date().toISOString().slice(0, 10));
  }
  if (filters.followUpFrom) {
    parts.clauses.push('follow_up_date IS NOT NULL AND DATE(follow_up_date) >= DATE(?)');
    parts.params.push(filters.followUpFrom);
  }
  if (filters.followUpTo) {
    parts.clauses.push('follow_up_date IS NOT NULL AND DATE(follow_up_date) <= DATE(?)');
    parts.params.push(filters.followUpTo);
  }
  if (filters.addedFrom) {
    parts.clauses.push('DATE(created_at) >= DATE(?)');
    parts.params.push(filters.addedFrom);
  }
  if (filters.addedTo) {
    parts.clauses.push('DATE(created_at) <= DATE(?)');
    parts.params.push(filters.addedTo);
  }

  return parts;
}

export interface LeadPage {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function listLeads(db: Db, filters: LeadFilters): LeadPage {
  const { clauses, params } = buildWhere(filters);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const sortKey: SortColumn = filters.sort && filters.sort in SORTABLE_COLUMNS ? filters.sort : 'score';
  const column = SORTABLE_COLUMNS[sortKey];
  const order = filters.order === 'asc' ? 'ASC' : 'DESC';
  // NULLs always sort last, whichever direction the user picked.
  const orderBy = `${column} IS NULL, ${column} ${order}, score DESC, id ASC`;

  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 500);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const total = (db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM leads ${where}`).get(...params))?.n ?? 0;
  const rows = db
    .prepare<unknown[], LeadRow>(`SELECT * FROM leads ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export function listAllMatching(db: Db, filters: LeadFilters, limit = 5000): LeadRow[] {
  const { clauses, params } = buildWhere(filters);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare<unknown[], LeadRow>(`SELECT * FROM leads ${where} ORDER BY score DESC, id ASC LIMIT ?`)
    .all(...params, limit);
}

export interface FacetOption {
  value: string;
  count: number;
}

/** Distinct values with counts, for populating the filter dropdowns. */
export function facets(db: Db): {
  cities: FacetOption[];
  regions: FacetOption[];
  trades: FacetOption[];
  statuses: FacetOption[];
  bands: FacetOption[];
} {
  const distinct = (column: string): FacetOption[] =>
    db
      .prepare<[], { value: string; count: number }>(
        `SELECT ${column} AS value, COUNT(*) AS count FROM leads
          WHERE ${column} IS NOT NULL AND ${column} != ''
          GROUP BY ${column} ORDER BY count DESC, value ASC`,
      )
      .all();

  return {
    cities: distinct('city'),
    regions: distinct('region'),
    trades: distinct('trade'),
    statuses: distinct('status'),
    bands: distinct('score_band'),
  };
}

/**
 * "Who should I call next?" — overdue follow-ups first, then unworked leads by
 * score. Do-not-call and closed leads never appear.
 */
export function callQueue(db: Db, limit = 25): LeadRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .prepare<[string, string, number], LeadRow>(
      `SELECT * FROM leads
        WHERE do_not_call = 0
          AND status NOT IN ('won', 'lost', 'not_suitable')
          AND COALESCE(phone_e164, '') != ''
          AND (
            (follow_up_date IS NOT NULL AND DATE(follow_up_date) <= DATE(?))
            OR status IN ('new', 'enriched', 'priority', 'ready_to_call')
          )
        ORDER BY
          CASE WHEN follow_up_date IS NOT NULL AND DATE(follow_up_date) <= DATE(?) THEN 0 ELSE 1 END,
          score DESC,
          google_review_count DESC,
          id ASC
        LIMIT ?`,
    )
    .all(today, today, limit);
}
