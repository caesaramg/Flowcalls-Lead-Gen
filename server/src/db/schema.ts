/**
 * Schema migrations. Append-only: each entry runs once, in order, inside a
 * transaction, and the applied version is recorded in `schema_migrations`.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: /* sql */ `
    CREATE TABLE leads (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at                TEXT NOT NULL,
      updated_at                TEXT NOT NULL,

      -- Pipeline
      status                    TEXT NOT NULL DEFAULT 'new',
      status_changed_at         TEXT NOT NULL,

      -- Business information
      company_name              TEXT NOT NULL,
      website                   TEXT,
      phone                     TEXT,
      phone_e164                TEXT,
      email                     TEXT,
      address_line              TEXT,
      city                      TEXT,
      postcode                  TEXT,
      region                    TEXT,
      country                   TEXT DEFAULT 'United Kingdom',
      trade                     TEXT,
      companies_house_number    TEXT,
      company_status            TEXT,
      year_established          INTEGER,
      employee_count            INTEGER,
      employee_count_basis      TEXT,

      -- Contact / owner (business contact data only)
      owner_name                TEXT,
      owner_role                TEXT,

      -- Google information
      google_place_id           TEXT,
      google_rating             REAL,
      google_review_count       INTEGER,
      google_maps_url           TEXT,
      google_category           TEXT,
      google_description        TEXT,
      opening_hours             TEXT,          -- JSON array of day strings
      opens_24_7                INTEGER NOT NULL DEFAULT 0,

      -- Services (booleans, 0/1)
      svc_plumbing              INTEGER NOT NULL DEFAULT 0,
      svc_heating               INTEGER NOT NULL DEFAULT 0,
      svc_boiler_repair         INTEGER NOT NULL DEFAULT 0,
      svc_boiler_install        INTEGER NOT NULL DEFAULT 0,
      svc_emergency             INTEGER NOT NULL DEFAULT 0,
      svc_drainage              INTEGER NOT NULL DEFAULT 0,
      svc_commercial            INTEGER NOT NULL DEFAULT 0,
      svc_domestic              INTEGER NOT NULL DEFAULT 0,
      svc_24_7                  INTEGER NOT NULL DEFAULT 0,
      svc_gas_safe              INTEGER NOT NULL DEFAULT 0,
      svc_bathrooms             INTEGER NOT NULL DEFAULT 0,
      svc_other                 TEXT,

      -- Marketing signals
      has_website               INTEGER NOT NULL DEFAULT 0,
      has_google_ads            INTEGER NOT NULL DEFAULT 0,
      has_facebook              INTEGER NOT NULL DEFAULT 0,
      has_instagram             INTEGER NOT NULL DEFAULT 0,
      has_linkedin              INTEGER NOT NULL DEFAULT 0,
      has_online_booking        INTEGER NOT NULL DEFAULT 0,
      has_contact_form          INTEGER NOT NULL DEFAULT 0,
      has_live_chat             INTEGER NOT NULL DEFAULT 0,
      booking_software          TEXT,
      marketing_signals         TEXT,          -- JSON array of detected signal codes
      website_quality_score     INTEGER,       -- 0-100
      facebook_url              TEXT,
      instagram_url             TEXT,
      linkedin_url              TEXT,

      -- Denormalised latest manual test-call result (see test_calls for history)
      test_call_attempted       INTEGER NOT NULL DEFAULT 0,
      test_call_at              TEXT,
      test_call_outcome         TEXT,
      test_call_answered        INTEGER,
      test_call_ring_seconds    INTEGER,
      test_call_out_of_hours    INTEGER NOT NULL DEFAULT 0,
      test_call_ooh_failure     INTEGER NOT NULL DEFAULT 0,
      test_call_poor_handling   INTEGER NOT NULL DEFAULT 0,
      test_call_booking_taken   INTEGER NOT NULL DEFAULT 0,
      test_call_notes           TEXT,

      -- Scoring
      score                     INTEGER NOT NULL DEFAULT 0,
      score_band                TEXT NOT NULL DEFAULT 'Low Priority',
      score_breakdown           TEXT,          -- JSON
      scored_at                 TEXT,
      scoring_config_version    INTEGER,

      -- Personalisation (generated from stored facts only)
      summary                   TEXT,
      opening_line              TEXT,
      summary_generated_at      TEXT,

      -- Manual calling workflow
      last_called_at            TEXT,
      last_call_outcome         TEXT,
      call_count                INTEGER NOT NULL DEFAULT 0,
      follow_up_date            TEXT,
      follow_up_notes           TEXT,
      next_action               TEXT,
      contract_value            REAL,          -- monthly value once won
      notes                     TEXT,

      -- Compliance
      do_not_call               INTEGER NOT NULL DEFAULT 0,
      do_not_call_reason        TEXT,
      do_not_call_at            TEXT,
      tps_screened_at           TEXT,
      tps_status                TEXT,          -- clear | listed | unknown

      -- Provenance / sourcing
      source                    TEXT NOT NULL DEFAULT 'manual',
      source_ref                TEXT,
      import_batch_id           INTEGER,
      enriched_at               TEXT,
      dedupe_key                TEXT NOT NULL
    );

    CREATE UNIQUE INDEX idx_leads_dedupe ON leads (dedupe_key);
    CREATE INDEX idx_leads_score ON leads (score DESC);
    CREATE INDEX idx_leads_status ON leads (status);
    CREATE INDEX idx_leads_city ON leads (city);
    CREATE INDEX idx_leads_region ON leads (region);
    CREATE INDEX idx_leads_trade ON leads (trade);
    CREATE INDEX idx_leads_follow_up ON leads (follow_up_date);
    CREATE INDEX idx_leads_phone ON leads (phone_e164);
    CREATE INDEX idx_leads_place ON leads (google_place_id);

    -- Which fields were filled automatically vs typed by a human.
    CREATE TABLE field_provenance (
      lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      field       TEXT NOT NULL,
      source      TEXT NOT NULL,   -- manual | csv | google_places | companies_house | website | apify | derived
      detail      TEXT,
      confidence  REAL,
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (lead_id, field)
    );

    -- Manual test calls ("how do they handle the phone?")
    CREATE TABLE test_calls (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id        INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      attempted_at   TEXT NOT NULL,
      outcome        TEXT NOT NULL,
      answered       INTEGER NOT NULL DEFAULT 0,
      ring_seconds   INTEGER,
      out_of_hours   INTEGER NOT NULL DEFAULT 0,
      ooh_failure    INTEGER NOT NULL DEFAULT 0,
      poor_handling  INTEGER NOT NULL DEFAULT 0,
      booking_taken  INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     TEXT NOT NULL
    );
    CREATE INDEX idx_test_calls_lead ON test_calls (lead_id, attempted_at DESC);

    -- Manual sales calls (logged by the user after they dial)
    CREATE TABLE calls (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id          INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      called_at        TEXT NOT NULL,
      outcome          TEXT NOT NULL,
      contact_name     TEXT,
      duration_seconds INTEGER,
      notes            TEXT,
      follow_up_date   TEXT,
      follow_up_notes  TEXT,
      next_action      TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX idx_calls_lead ON calls (lead_id, called_at DESC);
    CREATE INDEX idx_calls_date ON calls (called_at DESC);

    CREATE TABLE status_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status   TEXT NOT NULL,
      reason      TEXT,
      changed_at  TEXT NOT NULL
    );
    CREATE INDEX idx_status_events_lead ON status_events (lead_id, changed_at DESC);

    CREATE TABLE scoring_configs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      config     TEXT NOT NULL,   -- JSON
      is_active  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE import_batches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT,
      source        TEXT NOT NULL,
      row_count     INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      report        TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE enrichment_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id        INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      provider       TEXT NOT NULL,
      status         TEXT NOT NULL,     -- ok | skipped | error
      fields_updated TEXT,              -- JSON array
      message        TEXT,
      started_at     TEXT NOT NULL,
      finished_at    TEXT
    );
    CREATE INDEX idx_enrichment_lead ON enrichment_runs (lead_id, started_at DESC);

    -- TPS/CTPS + "do not contact" suppression, matched on normalised phone.
    CREATE TABLE suppression_list (
      phone_e164 TEXT PRIMARY KEY,
      reason     TEXT NOT NULL,
      source     TEXT,
      added_at   TEXT NOT NULL,
      notes      TEXT
    );

    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    `,
  },
];
