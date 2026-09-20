import type { Db } from '../db/index.js';
import { phoneKind } from './uk.js';
import { DEFAULT_SCORING_CONFIG } from './scoring-default.js';
import { type ScorableLead, type ScoringConfig, scoreLead, validateScoringConfig } from './scoring.js';
import type { LeadRow } from './types.js';

export interface StoredScoringConfig {
  id: number;
  name: string;
  config: ScoringConfig;
  is_active: number;
  created_at: string;
}

export function getActiveScoringConfig(db: Db): StoredScoringConfig {
  const row = db
    .prepare<[], { id: number; name: string; config: string; is_active: number; created_at: string }>(
      'SELECT * FROM scoring_configs WHERE is_active = 1 ORDER BY id DESC LIMIT 1',
    )
    .get();

  if (row) {
    return { ...row, config: JSON.parse(row.config) as ScoringConfig };
  }
  return installDefaultScoringConfig(db);
}

export function installDefaultScoringConfig(db: Db): StoredScoringConfig {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO scoring_configs (name, config, is_active, created_at) VALUES (?, ?, 1, ?)')
    .run('Default', JSON.stringify(DEFAULT_SCORING_CONFIG), now);
  return {
    id: Number(info.lastInsertRowid),
    name: 'Default',
    config: DEFAULT_SCORING_CONFIG,
    is_active: 1,
    created_at: now,
  };
}

/**
 * Saves a new active version. Previous versions are kept (never mutated) so a
 * score recorded last month can still be explained.
 */
export function saveScoringConfig(db: Db, config: ScoringConfig, name = 'Custom'): StoredScoringConfig {
  const errors = validateScoringConfig(config);
  if (errors.length > 0) {
    const error = new Error(`Invalid scoring config: ${errors.join('; ')}`);
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const current = getActiveScoringConfig(db);
  const next: ScoringConfig = { ...config, version: current.config.version + 1 };
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE scoring_configs SET is_active = 0 WHERE is_active = 1').run();
    return db
      .prepare('INSERT INTO scoring_configs (name, config, is_active, created_at) VALUES (?, ?, 1, ?)')
      .run(name, JSON.stringify(next), now);
  });
  const info = tx();

  return { id: Number(info.lastInsertRowid), name, config: next, is_active: 1, created_at: now };
}

export function listScoringConfigs(db: Db): StoredScoringConfig[] {
  return db
    .prepare<[], { id: number; name: string; config: string; is_active: number; created_at: string }>(
      'SELECT * FROM scoring_configs ORDER BY id DESC',
    )
    .all()
    .map((row) => ({ ...row, config: JSON.parse(row.config) as ScoringConfig }));
}

/**
 * Fields a rule can reference: every stored column plus a handful of derived
 * conveniences. Keep this in sync with the field picker in the UI.
 */
export function toScorable(lead: LeadRow): ScorableLead {
  const record = lead as unknown as Record<string, unknown>;
  return {
    ...record,
    phone_kind: phoneKind(lead.phone_e164),
    has_email: lead.email ? 1 : 0,
    has_phone: lead.phone_e164 ? 1 : 0,
    has_owner_name: lead.owner_name ? 1 : 0,
    review_count: lead.google_review_count ?? 0,
    is_limited_company: lead.companies_house_number ? 1 : 0,
  };
}

export interface RescoreResult {
  scored: number;
  configVersion: number;
}

export function rescoreLead(db: Db, lead: LeadRow, config: ScoringConfig): { score: number; band: string } {
  const result = scoreLead(toScorable(lead), config);
  db.prepare(
    `UPDATE leads
        SET score = ?, score_band = ?, score_breakdown = ?, scored_at = ?, scoring_config_version = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    result.score,
    result.band.label,
    JSON.stringify(result.breakdown),
    new Date().toISOString(),
    config.version,
    new Date().toISOString(),
    lead.id,
  );
  return { score: result.score, band: result.band.label };
}

export function rescoreAll(db: Db): RescoreResult {
  const { config } = getActiveScoringConfig(db);
  const leads = db.prepare<[], LeadRow>('SELECT * FROM leads').all();
  const tx = db.transaction(() => {
    for (const lead of leads) rescoreLead(db, lead, config);
  });
  tx();
  return { scored: leads.length, configVersion: config.version };
}
