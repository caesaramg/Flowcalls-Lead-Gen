import { useState } from 'react';
import { api } from '../lib/api';
import { ErrorNote, Field } from './ui';

const OUTCOME_GROUPS: Array<{ heading: string; outcomes: string[] }> = [
  { heading: 'Did not reach anyone', outcomes: ['no_answer', 'voicemail', 'wrong_number'] },
  { heading: 'Reached someone', outcomes: ['gatekeeper', 'owner_reached', 'interested', 'not_interested'] },
  { heading: 'Next step', outcomes: ['follow_up_required', 'demo_booked', 'customer', 'not_suitable'] },
];

const NEEDS_FOLLOW_UP = ['gatekeeper', 'interested', 'follow_up_required', 'no_answer', 'voicemail'];

export function CallLogger({ leadId, labels, onLogged }: {
  leadId: number;
  labels: Record<string, string>;
  onLogged: () => void;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [contactName, setContactName] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(value: string) {
    setOutcome(value);
    setError(null);
    if (NEEDS_FOLLOW_UP.includes(value) && !followUpDate) {
      const days = value === 'no_answer' || value === 'voicemail' ? 2 : 7;
      setFollowUpDate(new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10));
    }
  }

  async function submit() {
    if (!outcome) {
      setError('Pick an outcome first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/leads/${leadId}/calls`, {
        outcome,
        contact_name: contactName || null,
        notes: notes || null,
        follow_up_date: followUpDate || null,
        follow_up_notes: followUpNotes || null,
        next_action: nextAction || null,
        contract_value: contractValue ? Number(contractValue) : null,
      });
      setOutcome(null);
      setNotes('');
      setContactName('');
      setFollowUpDate('');
      setFollowUpNotes('');
      setNextAction('');
      setContractValue('');
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {OUTCOME_GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="label mb-1.5">{group.heading}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.outcomes.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => pick(value)}
                className={`btn px-2.5 py-1.5 text-xs ${outcome === value ? 'btn-primary' : ''}`}
              >
                {labels[value] ?? value}
              </button>
            ))}
          </div>
        </div>
      ))}

      {outcome ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-sunken/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who did you speak to?">
              <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name or role" />
            </Field>
            <Field label="Follow-up date">
              <input className="input" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Call notes">
            <textarea className="input min-h-[4.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was said, objections, who answers the phone…" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Next action">
              <input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send example call recording" />
            </Field>
            <Field label="Follow-up notes">
              <input className="input" value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} placeholder="What to open with next time" />
            </Field>
          </div>

          {outcome === 'customer' ? (
            <Field label="Monthly contract value (£)" hint="Feeds the revenue figure on the dashboard.">
              <input className="input" type="number" min={0} value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
            </Field>
          ) : null}

          {error ? <ErrorNote message={error} /> : null}

          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Save call'}
            </button>
            <button type="button" className="btn" onClick={() => setOutcome(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TestCallLogger({ leadId, labels, onLogged }: {
  leadId: number;
  labels: Record<string, string>;
  onLogged: () => void;
}) {
  const [outcome, setOutcome] = useState('');
  const [ringSeconds, setRingSeconds] = useState('');
  const [outOfHours, setOutOfHours] = useState(false);
  const [poorHandling, setPoorHandling] = useState(false);
  const [bookingTaken, setBookingTaken] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!outcome) {
      setError('Pick what happened when you rang.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/leads/${leadId}/test-calls`, {
        outcome,
        ring_seconds: ringSeconds ? Number(ringSeconds) : null,
        out_of_hours: outOfHours,
        poor_handling: poorHandling,
        booking_taken: bookingTaken,
        notes: notes || null,
      });
      setOutcome('');
      setRingSeconds('');
      setOutOfHours(false);
      setPoorHandling(false);
      setBookingTaken(false);
      setNotes('');
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Ring the number yourself and record what happened. This is the biggest single input to the opportunity score.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What happened?">
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Choose…</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rings before it was picked up / gave up (seconds)">
          <input className="input" type="number" min={0} max={600} value={ringSeconds} onChange={(e) => setRingSeconds(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="h-4 w-4 rounded border-line text-accent" checked={outOfHours} onChange={(e) => setOutOfHours(e.target.checked)} />
          Called outside their advertised hours
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="h-4 w-4 rounded border-line text-accent" checked={poorHandling} onChange={(e) => setPoorHandling(e.target.checked)} />
          Handled badly when answered
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="h-4 w-4 rounded border-line text-accent" checked={bookingTaken} onChange={(e) => setBookingTaken(e.target.checked)} />
          They took a booking
        </label>
      </div>

      <Field label="Notes">
        <textarea className="input min-h-[3.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who answered, how long it rang, what the greeting was…" />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <div>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save test call'}
        </button>
      </div>
    </div>
  );
}
