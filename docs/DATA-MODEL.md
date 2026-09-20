# Data model and API

One SQLite file (`data/flowcalls.db`) holds everything. Migrations are
append-only and run automatically on start-up.

---

## Tables

### `leads`

One row per business. Grouped by purpose:

| Group | Columns |
|---|---|
| Identity | `company_name`, `website`, `phone`, `phone_e164`, `email`, `address_line`, `city`, `postcode`, `region`, `country`, `trade` |
| Company | `companies_house_number`, `company_status`, `year_established`, `employee_count`, `employee_count_basis`, `owner_name`, `owner_role` |
| Google | `google_place_id`, `google_rating`, `google_review_count`, `google_maps_url`, `google_category`, `google_description`, `opening_hours` (JSON), `opens_24_7` |
| Services (0/1) | `svc_plumbing`, `svc_heating`, `svc_boiler_repair`, `svc_boiler_install`, `svc_emergency`, `svc_drainage`, `svc_commercial`, `svc_domestic`, `svc_24_7`, `svc_gas_safe`, `svc_bathrooms`, `svc_other` |
| Marketing (0/1) | `has_website`, `has_google_ads`, `has_facebook`, `has_instagram`, `has_linkedin`, `has_online_booking`, `has_contact_form`, `has_live_chat`, `booking_software`, `marketing_signals` (JSON), `website_quality_score`, `facebook_url`, `instagram_url`, `linkedin_url` |
| Phone test (latest) | `test_call_attempted`, `test_call_at`, `test_call_outcome`, `test_call_answered`, `test_call_ring_seconds`, `test_call_out_of_hours`, `test_call_ooh_failure`, `test_call_poor_handling`, `test_call_booking_taken`, `test_call_notes` |
| Scoring | `score`, `score_band`, `score_breakdown` (JSON), `scored_at`, `scoring_config_version` |
| Personalisation | `summary`, `opening_line`, `summary_generated_at` |
| Pipeline | `status`, `status_changed_at`, `last_called_at`, `last_call_outcome`, `call_count`, `follow_up_date`, `follow_up_notes`, `next_action`, `contract_value`, `notes` |
| Compliance | `do_not_call`, `do_not_call_reason`, `do_not_call_at`, `tps_screened_at`, `tps_status` |
| Sourcing | `source`, `source_ref`, `import_batch_id`, `enriched_at`, `dedupe_key` |

`dedupe_key` is unique and carries the business's identity, in priority order:

```
place:<google place id>  →  phone:<E.164>  →  site:<domain>  →  name:<canonical name>|<postcode or city>
```

`phone_e164` is derived from `phone`; `region` is derived from `postcode` when a
canonical region can be worked out, because sources label the region
inconsistently ("Greater Manchester", "West Yorkshire", "England").

### `field_provenance`

`(lead_id, field)` → `source`, `detail`, `confidence`, `updated_at`.

Source is one of `manual`, `csv`, `google_places`, `companies_house`, `website`,
`apify`, `derived`. A field whose provenance is `manual` is never overwritten by
an automated provider.

### `test_calls` / `calls`

Full history behind the denormalised latest-test columns on `leads`, and the
manual sales call log. Sales-call outcomes drive the pipeline status.

### `status_events`

Every status change with `from_status`, `to_status`, `reason` and `changed_at`.

### `scoring_configs`

Versioned scoring JSON; exactly one row has `is_active = 1`. Old versions are
never mutated, so a score recorded under v1 can still be explained after v4 is
saved.

### `suppression_list`

`phone_e164` (primary key), `reason`, `source`, `added_at`. Applied at import
time and by `applySuppressionList()`.

### `import_batches` / `enrichment_runs`

Audit trails for what came in and what each provider did.

### `settings`

Key/value store for anything operational.

---

## Pipeline

```
new → enriched → priority → ready_to_call → called → follow_up
                                                   ↘ demo_booked → proposal → won
                                                   ↘ lost
                                                   ↘ not_suitable
```

The system only ever advances a lead automatically within
`new / enriched / priority / ready_to_call` (on scoring), plus the status implied
by a logged call outcome. Anything past that is yours to set.

Call outcome → status:

| Outcome | Status |
|---|---|
| `no_answer`, `voicemail`, `owner_reached` | `called` |
| `gatekeeper`, `interested`, `follow_up_required` | `follow_up` |
| `demo_booked` | `demo_booked` |
| `customer` | `won` |
| `not_interested` | `lost` |
| `wrong_number`, `not_suitable` | `not_suitable` |

---

## API

All under `/api`. JSON in, JSON out.

### Prospects

| Method | Path | Notes |
|---|---|---|
| `GET` | `/leads` | Filter, sort, paginate — see below |
| `GET` | `/leads/facets` | Distinct cities / regions / trades / statuses with counts |
| `GET` | `/leads/export.csv` | Same filters, CSV out |
| `GET` | `/leads/:id` | Lead + score breakdown + personalisation + provenance + history |
| `POST` | `/leads` | Create (de-duplicates against existing) |
| `PATCH` | `/leads/:id` | Manual edit; rejects non-editable fields |
| `DELETE` | `/leads/:id` | Erasure |
| `POST` | `/leads/:id/status` | Move pipeline stage |
| `POST` | `/leads/:id/calls` | Log a sales call (409 if do-not-call) |
| `POST` | `/leads/:id/test-calls` | Log a phone-handling test; rescores immediately |
| `POST` | `/leads/:id/enrich` | Run providers for one lead |
| `POST` | `/leads/:id/personalisation` | Regenerate the briefing |
| `POST` / `DELETE` | `/leads/:id/do-not-call` | Suppress / unsuppress |
| `GET` | `/call-queue?limit=25` | Who to call next |

**Filters** on `/leads` and `/leads/export.csv`: `q`, `status`, `band`, `city`,
`region`, `trade`, `scoreMin`, `scoreMax`, `ratingMin`, `reviewsMin`,
`reviewsMax`, `employeesMin`, `employeesMax`, `emergency`, `service247`,
`googleAds`, `hasWebsite`, `hasOnlineBooking`, `hasEmail`, `testCalled`,
`testOutcome`, `callOutcome`, `followUpDue`, `followUpFrom`, `followUpTo`,
`addedFrom`, `addedTo`, `doNotCall` (`exclude` | `include` | `only`), `sort`,
`order`, `page`, `pageSize`.

List filters accept repeated params or a comma-separated value. Default sort is
`score desc`. Do-not-call prospects are excluded unless asked for.

### Everything else

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health`, `/meta`, `/dashboard` | Health, enums + provider status, dashboard metrics |
| `GET` / `PUT` | `/scoring` | Read / save the scoring config (saving rescores) |
| `POST` | `/scoring/rescore`, `/scoring/preview` | Rescore all; validate without saving |
| `POST` | `/import/preview`, `/import/csv` | Column mapping preview; import (multipart) |
| `GET` | `/import/batches` | Import history |
| `GET` | `/acquire/plan` | Search plan for a target prospect count |
| `POST` | `/acquire/search` | Run Maps searches and import |
| `POST` | `/enrich/batch` | Enrich many |
| `GET` / `POST` | `/suppression` | List / add suppressed numbers |
| `DELETE` | `/suppression/:phone` | Remove one |
| `GET` | `/compliance/retention` | Retention policy and how many records are eligible |

Errors come back as `{ "error": "...", "details": ... }` with a matching HTTP
status.
