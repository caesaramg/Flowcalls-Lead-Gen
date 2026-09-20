/**
 * Flowcalls Opportunity Score.
 *
 * Weights live in data (a JSON config stored in `scoring_configs`), not in code,
 * so they can be re-tuned from the UI without a deploy. This module only knows
 * how to evaluate a config against a lead.
 */

export type Condition =
  | { field: string; op: 'is_true' | 'is_false' | 'is_null' | 'not_null' }
  | { field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number }
  | { field: string; op: 'in' | 'not_in'; value: Array<string | number> }
  | { field: string; op: 'contains'; value: string }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface ScoringRule {
  id: string;
  label: string;
  group: string;
  points: number;
  enabled: boolean;
  when: Condition;
  /** Shown in the UI so the user knows exactly what the rule means. */
  description?: string;
}

export interface ScoringBand {
  id: string;
  label: string;
  min: number;
  action: string;
}

export interface ScoringConfig {
  version: number;
  cap: number;
  floor: number;
  rules: ScoringRule[];
  bands: ScoringBand[];
}

export interface RuleResult {
  id: string;
  label: string;
  group: string;
  points: number;
  matched: boolean;
  applied: number;
}

export interface ScoreResult {
  score: number;
  rawScore: number;
  band: ScoringBand;
  breakdown: RuleResult[];
  configVersion: number;
}

export type ScorableLead = Record<string, unknown>;

function valueOf(lead: ScorableLead, field: string): unknown {
  return Object.prototype.hasOwnProperty.call(lead, field) ? lead[field] : undefined;
}

function truthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
  return Boolean(value);
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

export function evaluateCondition(condition: Condition, lead: ScorableLead): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, lead));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, lead));
  if ('not' in condition) return !evaluateCondition(condition.not, lead);

  const value = valueOf(lead, condition.field);

  switch (condition.op) {
    case 'is_true':
      return truthy(value);
    case 'is_false':
      return !truthy(value);
    case 'is_null':
      return value === null || value === undefined || value === '';
    case 'not_null':
      return !(value === null || value === undefined || value === '');
    case 'eq':
      return String(value ?? '') === String(condition.value);
    case 'neq':
      return String(value ?? '') !== String(condition.value);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const left = numeric(value);
      const right = numeric(condition.value);
      if (left === null || right === null) return false;
      if (condition.op === 'gt') return left > right;
      if (condition.op === 'gte') return left >= right;
      if (condition.op === 'lt') return left < right;
      return left <= right;
    }
    case 'in':
      return condition.value.map(String).includes(String(value ?? ''));
    case 'not_in':
      return !condition.value.map(String).includes(String(value ?? ''));
    case 'contains':
      return String(value ?? '').toLowerCase().includes(String(condition.value).toLowerCase());
    default:
      return false;
  }
}

export function bandFor(config: ScoringConfig, score: number): ScoringBand {
  const sorted = [...config.bands].sort((a, b) => b.min - a.min);
  const match = sorted.find((b) => score >= b.min);
  const fallback: ScoringBand = { id: 'unscored', label: 'Low Priority', min: 0, action: 'Do not prioritise.' };
  return match ?? sorted[sorted.length - 1] ?? fallback;
}

export function scoreLead(lead: ScorableLead, config: ScoringConfig): ScoreResult {
  const breakdown: RuleResult[] = [];
  let raw = 0;

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    let matched = false;
    try {
      matched = evaluateCondition(rule.when, lead);
    } catch {
      matched = false;
    }
    const applied = matched ? rule.points : 0;
    raw += applied;
    breakdown.push({
      id: rule.id,
      label: rule.label,
      group: rule.group,
      points: rule.points,
      matched,
      applied,
    });
  }

  const score = Math.max(config.floor, Math.min(config.cap, Math.round(raw)));
  return { score, rawScore: raw, band: bandFor(config, score), breakdown, configVersion: config.version };
}

const CONDITION_OPS = new Set([
  'is_true', 'is_false', 'is_null', 'not_null',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains',
]);

function validateCondition(condition: unknown, path: string, errors: string[]): void {
  if (typeof condition !== 'object' || condition === null) {
    errors.push(`${path}: condition must be an object`);
    return;
  }
  const c = condition as Record<string, unknown>;
  if ('all' in c || 'any' in c) {
    const key = 'all' in c ? 'all' : 'any';
    const list = c[key];
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${path}.${key}: must be a non-empty array`);
      return;
    }
    list.forEach((child, i) => validateCondition(child, `${path}.${key}[${i}]`, errors));
    return;
  }
  if ('not' in c) {
    validateCondition(c['not'], `${path}.not`, errors);
    return;
  }
  if (typeof c['field'] !== 'string' || c['field'] === '') errors.push(`${path}.field: required string`);
  if (typeof c['op'] !== 'string' || !CONDITION_OPS.has(c['op'])) {
    errors.push(`${path}.op: must be one of ${[...CONDITION_OPS].join(', ')}`);
  }
  const needsValue = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains'];
  if (typeof c['op'] === 'string' && needsValue.includes(c['op']) && c['value'] === undefined) {
    errors.push(`${path}.value: required for op "${String(c['op'])}"`);
  }
  if ((c['op'] === 'in' || c['op'] === 'not_in') && !Array.isArray(c['value'])) {
    errors.push(`${path}.value: must be an array for op "${String(c['op'])}"`);
  }
}

/** Returns a list of human-readable problems; empty means the config is usable. */
export function validateScoringConfig(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) return ['config must be an object'];
  const config = input as Record<string, unknown>;

  if (typeof config['cap'] !== 'number') errors.push('cap: required number');
  if (typeof config['floor'] !== 'number') errors.push('floor: required number');
  if (typeof config['version'] !== 'number') errors.push('version: required number');

  const rules = config['rules'];
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push('rules: required non-empty array');
  } else {
    const ids = new Set<string>();
    rules.forEach((rule, i) => {
      if (typeof rule !== 'object' || rule === null) {
        errors.push(`rules[${i}]: must be an object`);
        return;
      }
      const r = rule as Record<string, unknown>;
      if (typeof r['id'] !== 'string' || r['id'] === '') errors.push(`rules[${i}].id: required string`);
      else if (ids.has(r['id'])) errors.push(`rules[${i}].id: duplicate id "${r['id']}"`);
      else ids.add(r['id']);
      if (typeof r['label'] !== 'string' || r['label'] === '') errors.push(`rules[${i}].label: required string`);
      if (typeof r['group'] !== 'string' || r['group'] === '') errors.push(`rules[${i}].group: required string`);
      if (typeof r['points'] !== 'number' || !Number.isFinite(r['points'])) {
        errors.push(`rules[${i}].points: required number`);
      }
      if (typeof r['enabled'] !== 'boolean') errors.push(`rules[${i}].enabled: required boolean`);
      validateCondition(r['when'], `rules[${i}].when`, errors);
    });
  }

  const bands = config['bands'];
  if (!Array.isArray(bands) || bands.length === 0) {
    errors.push('bands: required non-empty array');
  } else {
    bands.forEach((band, i) => {
      if (typeof band !== 'object' || band === null) {
        errors.push(`bands[${i}]: must be an object`);
        return;
      }
      const b = band as Record<string, unknown>;
      if (typeof b['id'] !== 'string' || b['id'] === '') errors.push(`bands[${i}].id: required string`);
      if (typeof b['label'] !== 'string' || b['label'] === '') errors.push(`bands[${i}].label: required string`);
      if (typeof b['min'] !== 'number') errors.push(`bands[${i}].min: required number`);
      if (typeof b['action'] !== 'string') errors.push(`bands[${i}].action: required string`);
    });
  }

  return errors;
}

/** Highest-value signals first — used for the "why call them" line in the UI. */
export function topReasons(result: ScoreResult, limit = 4): string[] {
  return result.breakdown
    .filter((r) => r.matched && r.applied > 0)
    .sort((a, b) => b.applied - a.applied)
    .slice(0, limit)
    .map((r) => r.label);
}
