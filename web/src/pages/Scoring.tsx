import { useEffect, useState } from 'react';
import { ErrorNote, Section, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import type { ScoringConfig } from '../lib/types';

interface ScoringResponse {
  active: { id: number; name: string; config: ScoringConfig; created_at: string };
  versions: Array<{ id: number; name: string; version: number; is_active: number; created_at: string }>;
}

export default function ScoringPage() {
  const scoring = useApi<ScoringResponse>('/scoring');
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (scoring.data) {
      setConfig(structuredClone(scoring.data.active.config));
      setJson(JSON.stringify(scoring.data.active.config, null, 2));
    }
  }, [scoring.data]);

  if (scoring.loading) return <Spinner />;
  if (scoring.error) return <ErrorNote message={scoring.error} />;
  if (!config) return null;

  const groups = [...new Set(config.rules.map((r) => r.group))];
  const maxPossible = config.rules.filter((r) => r.enabled && r.points > 0).reduce((sum, r) => sum + r.points, 0);

  function update(next: ScoringConfig) {
    setConfig(next);
    setJson(JSON.stringify(next, null, 2));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = advanced ? (JSON.parse(json) as ScoringConfig) : config;
      const result = await api.post<{ active: { config: ScoringConfig }; rescored: { scored: number } | null }>(
        '/scoring',
        { config: payload, name: 'Custom', rescore: true },
      );
      setMessage(
        `Saved as version ${result.active.config.version}. ${result.rescored ? `${result.rescored.scored} prospects rescored.` : ''}`,
      );
      scoring.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Flowcalls Opportunity Score"
        description={`Version ${config.version}. Every prospect is scored out of ${config.cap}. Change a weight and everything is rescored.`}
        right={
          <div className="flex gap-2">
            <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'Simple editor' : 'Edit as JSON'}
            </button>
            <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save and rescore'}
            </button>
          </div>
        }
      >
        {message ? (
          <p className="mb-3 rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-ink">{message}</p>
        ) : null}
        {error ? <div className="mb-3"><ErrorNote message={error} /></div> : null}

        {advanced ? (
          <div>
            <textarea
              className="input min-h-[28rem] font-mono text-xs"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-ink-muted">
              Add your own rules here. A rule needs an id, label, group, points, enabled flag and a <code>when</code>{' '}
              condition — for example{' '}
              <code className="font-mono">{'{"field":"google_review_count","op":"gte","value":250}'}</code>. Conditions
              can be combined with <code>all</code>, <code>any</code> and <code>not</code>.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{group}</h3>
                <ul className="flex flex-col divide-y divide-line">
                  {config.rules
                    .map((rule, index) => ({ rule, index }))
                    .filter(({ rule }) => rule.group === group)
                    .map(({ rule, index }) => (
                      <li key={rule.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-line text-accent"
                          checked={rule.enabled}
                          onChange={(e) => {
                            const rules = [...config.rules];
                            rules[index] = { ...rule, enabled: e.target.checked };
                            update({ ...config, rules });
                          }}
                        />
                        <div className="min-w-[16rem] flex-1">
                          <p className={`text-sm font-medium ${rule.enabled ? 'text-ink' : 'text-ink-muted'}`}>
                            {rule.label}
                          </p>
                          {rule.description ? <p className="text-xs text-ink-muted">{rule.description}</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="input w-20 py-1 text-right"
                            value={rule.points}
                            onChange={(e) => {
                              const rules = [...config.rules];
                              rules[index] = { ...rule, points: Number(e.target.value) };
                              update({ ...config, rules });
                            }}
                          />
                          <span className="text-xs text-ink-muted">points</span>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}

            <p className="text-xs text-ink-muted">
              Enabled rules add up to {maxPossible} points before the cap of {config.cap}.
            </p>
          </div>
        )}
      </Section>

      <Section title="Priority bands" description="Where each score lands in your calling order.">
        <ul className="flex flex-col divide-y divide-line">
          {[...config.bands]
            .sort((a, b) => b.min - a.min)
            .map((band) => {
              const index = config.bands.findIndex((b) => b.id === band.id);
              return (
                <li key={band.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <input
                    type="number"
                    className="input w-20 py-1 text-right"
                    value={band.min}
                    min={0}
                    max={config.cap}
                    onChange={(e) => {
                      const bands = [...config.bands];
                      bands[index] = { ...band, min: Number(e.target.value) };
                      update({ ...config, bands });
                    }}
                  />
                  <span className="text-xs text-ink-muted">and above</span>
                  <span className="min-w-[8rem] text-sm font-medium text-ink">{band.label}</span>
                  <span className="text-sm text-ink-muted">{band.action}</span>
                </li>
              );
            })}
        </ul>
      </Section>

      <Section title="Version history" description="Previous versions are kept so an old score can still be explained.">
        <ul className="flex flex-col gap-1 text-sm text-ink-soft">
          {(scoring.data?.versions ?? []).map((version) => (
            <li key={version.id} className="flex items-center gap-3">
              <span className="font-medium text-ink">v{version.version}</span>
              <span>{version.name}</span>
              <span className="text-xs text-ink-muted">{formatDateTime(version.created_at)}</span>
              {version.is_active ? <span className="chip">Active</span> : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
