# Flowcalls Prospecting & Lead Enrichment System

An internal tool for finding UK plumbing and heating businesses, enriching them,
scoring how much they need an AI phone answering service, and working the list by
hand.

**You make every call.** There is no auto-dialler, no bulk calling, and no
outbound messaging anywhere in this codebase. The system's job is to decide who
is worth ringing, tell you why, and remember what happened.

---

## The loop this is built around

```
 import / search  →  enrich  →  score  →  call queue  →  you dial  →  log outcome  →  follow up
```

1. **Import or search** — CSV from any Google Maps exporter, or the Places API / Apify directly.
2. **Enrich** — Google profile, website marketing signals, Companies House.
3. **Score** — a configurable 0–100 Flowcalls Opportunity Score.
4. **Call** — a focused one-at-a-time queue with a briefing and a big Call button.
5. **Record** — outcome, notes, follow-up date, pipeline status.

---

## Quick start

```bash
npm install
cp .env.example .env        # optional — the app runs without any keys
npm run seed:demo           # fictional sample data, so the app isn't empty
npm run dev                 # API on :4000, UI on :5173
```

Open <http://localhost:5173>.

For production-style use:

```bash
npm run build
npm start                   # serves the UI and the API together on :4000
```

Remove the demo data when you are ready for real prospects:

```bash
npm run seed:demo -- --purge
```

---

## Getting to 1,000 prospects

The brief is 1,000 *well-enriched* prospects, not the biggest list possible.

### Option A — CSV (no API keys needed)

Export plumbing and heating businesses from any Google Maps scraper, then:

```bash
npm run import:csv -- ~/Downloads/plumbers-leeds.csv --target-trades-only
```

or drag the file onto **Import** in the UI, where you can check the column
mapping first. Column names are matched against the ones Apify, Outscraper,
Bright Data and PhantomBuster produce; anything unrecognised is yours to map by
hand.

### Option B — search directly

With `GOOGLE_PLACES_API_KEY` (or `APIFY_TOKEN`) set:

```bash
npm run acquire -- --plan-only                 # see the search plan first
npm run acquire -- --target 1000               # work through it
npm run acquire -- --cities "Leeds,Sheffield"  # or just a patch
```

The planner works across UK cities × the five query templates from the brief
(`plumber`, `emergency plumber`, `heating engineer`, `boiler repair`,
`plumbing and heating`), pulling more results from bigger cities and fewer from
smaller ones. It assumes ~45% overlap between templates and plans accordingly.

### Then enrich

```bash
npm run enrich -- --limit 200
```

Enrichment is deliberately incremental — it processes the highest-scoring
un-enriched prospects first, so a half-finished run still leaves you with the
best of the batch ready to call.

---

## Enrichment providers

| Provider | Needs | Fills in |
|---|---|---|
| **Website** | nothing — uses the prospect's own site | Google Ads tag, booking software, contact form, live chat, social profiles, services, claimed 24/7 or emergency cover, team size, site quality score, role email |
| **Google Places** | `GOOGLE_PLACES_API_KEY` | Rating, review count, opening hours, category, phone, website, Maps URL |
| **Companies House** | `COMPANIES_HOUSE_API_KEY` | Company number, status, incorporation year, serving director's name |

Rules the enrichment layer sticks to:

- **A provider never overwrites something you typed.** Manual edits win permanently.
- **A provider never blanks a field.** It can only add or refresh.
- **Nothing is inferred.** A service flag is set because the words appear on the
  page; an employee count is recorded only when the site states a number. No
  field is ever filled with a plausible guess.
- **The crawler is polite.** robots.txt is honoured, there is a per-host delay,
  and at most five pages are fetched per site.
- **Every field records its source**, shown as a dot next to the value on the
  prospect page — blue for automatic, amber for hand-typed.

---

## The Flowcalls Opportunity Score

0–100, capped. Defaults, all editable in **Settings → Scoring**:

| Group | Signal | Points |
|---|---|---|
| Business value | Emergency service | +15 |
| | 24/7 service | +15 |
| | High-value services (boiler installs, commercial, heating) | +10 |
| | 5+ engineers | +10 |
| | 100+ Google reviews | +10 |
| | 500+ Google reviews (on top) | +5 |
| | Strong Google presence (4.5★ with 50+ reviews) | +5 |
| Marketing activity | Google Ads detected | +15 |
| | Active website | +5 |
| | Online marketing signals | +5 |
| Phone opportunity | No answer on your test call | +25 |
| | Voicemail | +20 |
| | Out-of-hours failure | +20 |
| | Poor call handling | +15 |

Three more rules ship switched off — a negative for businesses that already use
an answering service, a bonus for mobile-only numbers, and a bonus for spending
on marketing with no online booking. Turn them on if they match how you think.

**Bands:** 80+ Priority · 60–79 Good · 40–59 Test · below 40 Low Priority.

The weights live in the database as JSON, not in code. Editing them writes a new
version (old versions are kept, so a score recorded months ago can still be
explained) and rescores every prospect. The JSON editor accepts new rules of your
own — a rule is an id, a label, a group, points, and a `when` condition such as
`{"field":"google_review_count","op":"gte","value":250}`, combinable with `all`,
`any` and `not`.

---

## Test calls vs sales calls

Two different things, tracked separately.

- A **test call** is you ringing a prospect to see how they handle the phone. Log
  what happened — no answer, voicemail, automated menu, a human — plus whether
  you rang outside their advertised hours. This is the single biggest input to
  the score, and it is what makes the pitch concrete.
- A **sales call** is you pitching. Log the outcome, notes, follow-up date and
  next action; the pipeline status moves automatically.

---

## The call queue

**Call queue** answers "who do I ring next?": overdue follow-ups first, then the
highest-scoring prospects you have not worked, one at a time, with the briefing
and outcome buttons on the same screen. Do-not-call prospects, prospects with no
phone number, and closed prospects never appear.

Each prospect gets a generated summary and suggested opening line, built only
from stored facts:

> Kingsmoor Gas & Heating is a Reading-based plumbing and heating company with
> 204 Google reviews and a 4.2 rating. They advertise emergency callouts, 24/7
> availability, boiler repairs and boiler installations. Google Ads detected —
> they are paying for the calls that come in. Manual test call at 11:24 on
> 19 Sept was met by an automated menu.

Nothing is sent anywhere. It is a prompt for you, not a script that fires.

---

## Compliance

This is legitimate B2B prospecting, and the system has real controls rather than
just a disclaimer — suppression lists, provenance tracking, data minimisation,
retention purging, and no automated calling of any kind.

Read [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) before you start dialling. The
short version: **screen against TPS and CTPS first**, because sole traders and
unincorporated partnerships get consumer-level protection under PECR.

```bash
npm run suppression:import -- tps-export.csv
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + UI with hot reload |
| `npm run build` / `npm start` | Production build, served on one port |
| `npm test` | Test suite |
| `npm run typecheck` | Type-check both workspaces |
| `npm run db:migrate` | Create/upgrade the database |
| `npm run seed:demo` | Load the fictional sample data (`-- --purge` to remove) |
| `npm run import:csv -- <file>` | Import a CSV (`--dry-run`, `--target-trades-only`, `--limit N`) |
| `npm run acquire -- --target 1000` | Search Google Maps and import (`--plan-only`, `--dry-run`) |
| `npm run enrich -- --limit 200` | Enrich prospects (`--all`, `--refresh`, `--providers`) |
| `npm run rescore` | Rescore everything against the active config |
| `npm run suppression:import -- <file>` | Load TPS/CTPS numbers into the suppression list |
| `npm run retention:purge` | Report stale records (`--confirm` to delete) |

---

## How it is put together

```
server/          Node + TypeScript + Express, SQLite via better-sqlite3
  src/domain/    Leads, scoring, pipeline, personalisation, UK normalisation
  src/enrichment/ Website / Google Places / Companies House providers
  src/ingest/    CSV mapping and import, search planning
  src/routes/    REST API
  src/cli/       Command-line tools
web/             React + Vite + Tailwind single-page app
docs/            Compliance notes and the data model
sample-data/     Fictional demo CSV
data/            Your SQLite database (git-ignored)
```

One SQLite file holds everything. Back it up by copying `data/flowcalls.db`.

The API listens on `127.0.0.1` by default and has no authentication, because it
is a single-user tool on your own machine. If you ever put it on a network,
put it behind authentication first — the data inside is commercially sensitive
and subject to UK GDPR.

See [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) for the schema and the API routes.
