import { parse } from 'csv-parse/sync';
import type { Db } from '../db/index.js';
import { detectEmployeeCount, detectServices, detectTrade, isTargetTrade } from '../enrichment/classify.js';
import { applySuppressionList, autoAdvanceAfterScoring, regeneratePersonalisation, upsertLead } from '../domain/leads.js';
import { getActiveScoringConfig, rescoreLead } from '../domain/scoring-store.js';
import { getLead } from '../domain/leads.js';
import { normalisePhone } from '../domain/uk.js';
import { applyMapping, suggestMapping, type CanonicalField } from './csv-mapping.js';

export interface ImportOptions {
  filename?: string;
  source?: string;
  mapping?: Record<string, CanonicalField | null>;
  /** Skip rows whose text shows no plumbing/heating signal at all. */
  targetTradesOnly?: boolean;
  /** Preview without writing anything. */
  dryRun?: boolean;
  limit?: number;
}

export interface ImportRowIssue {
  row: number;
  company: string;
  reason: string;
}

export interface ImportReport {
  batchId: number | null;
  filename: string | null;
  rowCount: number;
  created: number;
  updated: number;
  skipped: number;
  suppressed: number;
  issues: ImportRowIssue[];
  mapping: Record<string, CanonicalField | null>;
  unmappedHeaders: string[];
  dryRun: boolean;
  sample: Array<Record<string, unknown>>;
}

export function parseCsv(content: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  return { headers, rows };
}

/** Apify/Outscraper often emit JSON arrays inside a single CSV cell. */
function firstOfList(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed.find((v) => typeof v === 'string' && v.trim() !== '');
        return typeof first === 'string' ? first.trim() : undefined;
      }
    } catch {
      /* fall through to the raw value */
    }
  }
  return trimmed;
}

function normaliseOpeningHours(value: string | undefined): { json: string | null; open24: boolean } {
  if (!value) return { json: null, open24: false };
  const raw = value.trim();
  let items: string[] = [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        items = parsed.map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            const o = entry as Record<string, unknown>;
            const day = o['day'] ?? o['dayOfWeek'] ?? '';
            const hours = o['hours'] ?? o['time'] ?? o['open'] ?? '';
            return `${String(day)}: ${String(hours)}`.trim();
          }
          return String(entry);
        });
      }
    } catch {
      items = [raw];
    }
  } else {
    items = raw.split(/\s*[;|]\s*|\n/).filter(Boolean);
  }
  items = items.map((s) => s.trim()).filter(Boolean);
  const open24 = items.some((s) => /open 24|24 ?hours|00:00\s*[-–]\s*(?:00:00|24:00)/i.test(s));
  return { json: items.length > 0 ? JSON.stringify(items) : null, open24 };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function importCsv(db: Db, content: string, options: ImportOptions = {}): ImportReport {
  const { headers, rows } = parseCsv(content);
  const mapping = options.mapping ?? suggestMapping(headers);
  const unmappedHeaders = headers.filter((h) => !mapping[h]);
  const limited = options.limit ? rows.slice(0, options.limit) : rows;

  const report: ImportReport = {
    batchId: null,
    filename: options.filename ?? null,
    rowCount: limited.length,
    created: 0,
    updated: 0,
    skipped: 0,
    suppressed: 0,
    issues: [],
    mapping,
    unmappedHeaders,
    dryRun: Boolean(options.dryRun),
    sample: [],
  };

  const prepared: Array<Record<string, unknown>> = [];

  limited.forEach((raw, index) => {
    const mapped = applyMapping(raw, mapping);
    const companyName = mapped['company_name'];
    if (!companyName) {
      report.skipped += 1;
      report.issues.push({ row: index + 2, company: '', reason: 'No company name column value' });
      return;
    }

    const values: Record<string, unknown> = { ...mapped };
    values['email'] = firstOfList(mapped['email']);
    if (values['email'] && !EMAIL_RE.test(String(values['email']))) values['email'] = undefined;

    const hours = normaliseOpeningHours(mapped['opening_hours']);
    if (hours.json) values['opening_hours'] = hours.json;
    if (hours.open24) values['opens_24_7'] = 1;

    // Infer services and trade from every scrap of text we have.
    const text = [
      companyName,
      mapped['google_category'],
      mapped['google_description'],
      mapped['svc_other'],
      mapped['source_ref'],
    ]
      .filter(Boolean)
      .join(' \n ');

    if (options.targetTradesOnly && !isTargetTrade(text)) {
      report.skipped += 1;
      report.issues.push({ row: index + 2, company: companyName, reason: 'No plumbing/heating signal in name or category' });
      return;
    }

    const detected = detectServices(text);
    for (const [field, flag] of Object.entries(detected)) {
      if (values[field] === undefined) values[field] = flag;
    }
    if (!values['trade']) {
      const trade = detectTrade(text);
      if (trade) values['trade'] = trade;
    }
    if (!values['employee_count']) {
      const staff = detectEmployeeCount(text);
      if (staff) {
        values['employee_count'] = staff.count;
        values['employee_count_basis'] = staff.basis;
      }
    }

    for (const social of ['facebook_url', 'instagram_url', 'linkedin_url'] as const) {
      const url = firstOfList(mapped[social]);
      if (url) {
        values[social] = url;
        values[social.replace('_url', '').replace(/^/, 'has_') as 'has_facebook'] = 1;
      }
    }

    values['company_name'] = companyName;
    values['source'] = options.source ?? 'csv';
    prepared.push(values);
  });

  report.sample = prepared.slice(0, 5);
  if (options.dryRun) return report;

  const now = new Date().toISOString();
  const batchInfo = db
    .prepare(
      `INSERT INTO import_batches (filename, source, row_count, created_count, updated_count, skipped_count, report, created_at)
       VALUES (?, ?, ?, 0, 0, 0, NULL, ?)`,
    )
    .run(options.filename ?? null, options.source ?? 'csv', report.rowCount, now);
  const batchId = Number(batchInfo.lastInsertRowid);
  report.batchId = batchId;

  const { config } = getActiveScoringConfig(db);

  const tx = db.transaction(() => {
    for (const values of prepared) {
      try {
        const result = upsertLead(db, values as { company_name: string }, {
          source: 'csv',
          detail: options.filename ?? 'CSV import',
          importBatchId: batchId,
          overwriteExisting: false,
        });
        if (result.created) report.created += 1;
        else report.updated += 1;

        const lead = getLead(db, result.id);
        if (lead) {
          rescoreLead(db, lead, config);
          autoAdvanceAfterScoring(db, result.id);
          regeneratePersonalisation(db, result.id);
        }
      } catch (error) {
        report.skipped += 1;
        report.issues.push({
          row: 0,
          company: String(values['company_name'] ?? ''),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  tx();

  report.suppressed = applySuppressionList(db);

  db.prepare(
    'UPDATE import_batches SET created_count = ?, updated_count = ?, skipped_count = ?, report = ? WHERE id = ?',
  ).run(report.created, report.updated, report.skipped, JSON.stringify(report.issues.slice(0, 200)), batchId);

  return report;
}

/** Imports one already-mapped business record (used by the Google Maps providers). */
export function importRecord(
  db: Db,
  values: Record<string, unknown> & { company_name: string },
  source: 'google_places' | 'apify' | 'manual',
  detail?: string,
): { id: number; created: boolean } {
  const text = [values['company_name'], values['google_category'], values['google_description']]
    .filter(Boolean)
    .join(' \n ');
  const detected = detectServices(text);
  for (const [field, flag] of Object.entries(detected)) {
    if (values[field] === undefined) values[field] = flag;
  }
  if (!values['trade']) {
    const trade = detectTrade(text);
    if (trade) values['trade'] = trade;
  }
  if (values['phone'] && !normalisePhone(String(values['phone']))) delete values['phone'];

  const result = upsertLead(db, values, { source, detail, overwriteExisting: false });
  const lead = getLead(db, result.id);
  if (lead) {
    const { config } = getActiveScoringConfig(db);
    rescoreLead(db, lead, config);
    autoAdvanceAfterScoring(db, result.id);
    regeneratePersonalisation(db, result.id);
  }
  return { id: result.id, created: result.created };
}
