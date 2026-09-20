# Compliance notes

This is engineering documentation for how the system handles UK data protection
and direct marketing rules. **It is not legal advice** — confirm your own
position with a suitably qualified adviser before you start a calling campaign.

---

## 1. What this system will not do

There is no auto-dialler, predictive dialler, power dialler, voice broadcaster,
recorded-message feature, bulk SMS or bulk email anywhere in this codebase, and
none is planned. The "Call" button is a plain `tel:` link that hands the number
to your phone. Every call is placed by a person and logged by a person.

This matters legally as well as practically: automated calling systems that play
a recorded message require **prior consent** under PECR regulation 19, and
silent/abandoned calls from diallers are an Ofcom enforcement area. Staying
manual keeps you out of both.

---

## 2. Screen against TPS and CTPS before you dial

The important trap in B2B telephone prospecting: **sole traders and
unincorporated partnerships (outside Scotland) count as "individual subscribers"
under PECR regulation 21.** Calling a TPS-registered sole trader is the same
offence as calling a TPS-registered consumer.

A lot of plumbers and heating engineers are sole traders. Assume your list is
full of them.

So:

1. Screen your numbers against **both** TPS and CTPS.
2. Load the results into the suppression list:
   ```bash
   npm run suppression:import -- tps-export.csv --reason "TPS September 2026"
   ```
3. Re-screen periodically — registrations are added continuously, and a list
   screened months ago is not screened.

The suppression list is matched on the normalised E.164 number, applied at
import time and on demand, and **survives re-import**: if a suppressed business
comes back in a later CSV, the sweep re-flags it automatically. A suppressed
prospect cannot have a call logged against it (the API returns 409), never
appears in the call queue, and is hidden from prospect lists by default.

Each lead also has `tps_screened_at` and `tps_status` fields so you can record
when a number was last checked.

---

## 3. Lawful basis

The usual basis for B2B prospecting is **legitimate interests** (UK GDPR Art.
6(1)(f)), which requires a documented balancing test. Before a campaign, write
down:

- **Purpose** — identifying plumbing and heating businesses that are losing
  work to missed calls, to offer a service that addresses it.
- **Necessity** — a phone call is how these businesses do business; there is no
  less intrusive way to establish whether the problem applies to them.
- **Balance** — only business contact details published by the business itself
  (or already on a public register) are held; the volume is low; every contact is
  individual and human; an objection is honoured immediately and permanently.

Keep that document with your records. Review it if the targeting changes.

---

## 4. Data minimisation — what is and is not collected

Held:

- Business name, trading address, business phone, business website.
- **Role-based** email addresses only (`info@`, `enquiries@`, `contact@`, …).
  The website enricher deliberately picks a role inbox over any personal-looking
  address it finds.
- Director name and role, from the **public Companies House register**, used to
  open a conversation with the right person.
- Public Google Business Profile data: rating, review count, hours, category.
- Your own notes and call outcomes.

Deliberately **not** held:

- Officers' dates of birth, residential addresses or other register fields
  beyond a name and role.
- Individual review text or reviewer identities.
- Named personal inboxes scraped from staff pages.
- Anything about someone in a personal capacity.

If you add a field, ask what it is for. If the answer is "it might be useful
later", do not add it.

---

## 5. Provenance — being able to show where data came from

Article 14 requires you to be able to tell people where their data came from
when it was not collected from them directly. Every field on every lead has a
row in `field_provenance` recording the source (`csv`, `google_places`,
`companies_house`, `website`, `manual`, `derived`), any detail (the exact URL
crawled, the Companies House match), and when it was written.

The prospect page shows this as a coloured dot beside each value: blue for
automatically found, amber for hand-typed. `enrichment_runs` keeps a full log of
every provider call per lead.

---

## 6. Objections and the right to erasure

An objection to direct marketing is absolute — there is no balancing test.

"Mark do-not-call" on the prospect page does three things in one action:

1. Sets `do_not_call` on the lead with your stated reason and a timestamp.
2. Adds the phone number to the permanent suppression list.
3. Blocks any further call logging against that prospect.

Keeping the suppressed number is itself required — you cannot honour an
objection you have deleted the record of. That is why "mark do-not-call" is a
suppression, not a deletion.

For an actual erasure request, delete the lead (`DELETE /api/leads/:id`) but keep
the number on the suppression list.

---

## 7. Retention

Prospect records that never went anywhere should not be kept indefinitely.
`RETENTION_MONTHS` (default 24) defines the policy; Settings shows how many
records are currently eligible.

```bash
npm run retention:purge                # report only
npm run retention:purge -- --confirm   # delete
```

Purging covers untouched prospects in `new`, `enriched`, `priority`,
`ready_to_call`, `lost` and `not_suitable`. Customers and live opportunities are
never auto-purged — they are a business relationship, not a prospect record.

---

## 8. Crawling other people's websites

The website enricher:

- honours `robots.txt` (`RESPECT_ROBOTS_TXT=true`, on by default);
- identifies itself with a configurable user agent that should carry **your**
  real contact address — set `ENRICHMENT_USER_AGENT` in `.env`;
- waits `CRAWL_DELAY_MS` (default 1.5s) between requests to the same host;
- fetches at most `MAX_PAGES_PER_SITE` (default 5) pages;
- reads only what is publicly served, follows no forms, and stores no page
  content beyond the derived signals.

---

## 9. Third-party terms

Google Places data is subject to the Google Maps Platform terms, which restrict
how long Place data may be cached and require attribution where it is displayed.
Review them against your intended use. The same applies to any scraping service
you point at Google Maps — the fact that a tool exists does not settle whether
your use of it is within the source's terms.

Companies House data is published under the Open Government Licence.

---

## 10. Security

The API binds to `127.0.0.1` and has no authentication, because it is designed as
a single-user tool on your own machine. The database contains commercially
sensitive data and personal data (director names, your call notes).

If you move it off your machine:

- put it behind authentication and TLS;
- restrict network access;
- encrypt the disk;
- back up `data/flowcalls.db` somewhere equally protected.

Do not deploy it to a public host as-is.

---

## 11. Quick checklist before a campaign

- [ ] TPS **and** CTPS screening done and loaded into the suppression list
- [ ] Legitimate interests assessment written down
- [ ] `ENRICHMENT_USER_AGENT` set to a real contact address
- [ ] A privacy notice available to send to anyone who asks where you got their details
- [ ] Retention policy agreed and `RETENTION_MONTHS` set to match
- [ ] Everyone doing the calling knows to mark do-not-call the moment someone objects
