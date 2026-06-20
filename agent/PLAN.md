# Agentic Coach Data Maintenance Plan

This is a build plan for a future automated RecruitFlow data agent. The first version should be conservative and auditable.

## Objective

Maintain coach contact data automatically without corrupting the database.

The agent should continuously answer:

- Is this coach still on staff?
- Is the title current?
- Is there a direct email?
- Is the email still accurate?
- Did users report the address as bad?
- Should the database update automatically or wait for review?

## Phase 1: Local Enrichment Command

Build a local command that can run against the JSON database first.

Suggested command:

```bash
npm run agent:check-coaches -- --school johns-hopkins-football
npm run agent:check-coaches -- --all
npm run agent:check-coaches -- --apply-safe
```

Responsibilities:

- load schools and coaches
- fetch official source pages
- cache fetched pages under `/tmp/recruitflow_agent`
- extract emails, names, titles, profile links, phone numbers, and X handles
- generate proposed changes
- write a JSON report
- apply only safe changes when `--apply-safe` is used

Output files:

```txt
/tmp/recruitflow_agent/run.json
/tmp/recruitflow_agent/proposals.json
/tmp/recruitflow_agent/rejected.json
/tmp/recruitflow_agent/errors.json
```

## Phase 2: Confidence Scoring

Each proposed change gets a score from `0.0` to `1.0`.

High-confidence examples:

- official source page
- coach name and email appear in the same row/card/profile page
- email local-part matches the coach name
- source was fetched successfully during this run
- address has not been reported bad

Low-confidence examples:

- email appears far from the coach name
- email local-part matches another visible staff member
- source is not official
- page is stale or filtered to an old season
- user reported the email as wrong

Initial thresholds:

```txt
0.95-1.00  auto_apply
0.70-0.94  needs_review
0.00-0.69  reject
```

## Phase 3: Codex CLI Reviewer

Add an optional Codex CLI review step for ambiguous cases.

Good use cases:

- coach may have left staff
- title changed but source layout is messy
- two people share a last name
- source page lists staff in generated JavaScript
- user report conflicts with official source

The deterministic extractor should send Codex a small evidence bundle, not the whole database.

Suggested bundle:

```json
{
  "coach": {},
  "school": {},
  "currentRecord": {},
  "sourceUrl": "",
  "sourceTextExcerpt": "",
  "candidateEmails": [],
  "knownBadEmails": []
}
```

Codex returns structured JSON only. The updater validates the JSON before using it.

## Phase 4: Bad Email Feedback Loop

Add user-facing bad-email reporting.

Examples:

- "This email bounced"
- "This coach no longer works here"
- "Wrong person"
- "Generic inbox only"

Store reports separately instead of immediately deleting data.

Suggested table:

```sql
create table coach_bad_email_reports (
  id text primary key,
  coach_id text not null,
  school_id text not null,
  email text not null,
  reason text not null,
  note text,
  source text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

Rule:

If an email has an unresolved bad-email report, the agent must not auto-apply that same email again, even if it appears on an official page.

## Phase 5: Supabase Audit Tables

Add run and proposal tables.

Suggested tables:

```sql
create table coach_data_runs (
  id text primary key,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked_count integer not null default 0,
  auto_applied_count integer not null default 0,
  review_count integer not null default 0,
  rejected_count integer not null default 0,
  error_count integer not null default 0,
  notes text
);

create table coach_data_change_proposals (
  id text primary key,
  run_id text not null references coach_data_runs(id),
  coach_id text not null,
  school_id text not null,
  field text not null,
  old_value text,
  new_value text,
  decision text not null,
  confidence numeric not null,
  source_url text,
  evidence text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rejected_at timestamptz
);
```

## Phase 6: Admin Review UI

Add a private admin page.

Views:

- latest run summary
- auto-applied changes
- pending review changes
- rejected changes
- source evidence
- approve/reject buttons
- one-click rollback for a run

The admin should be able to filter by:

- school
- division
- confidence
- change type
- source domain
- user-reported issues

## Phase 7: Scheduler

Run weekly at first.

Good schedule:

```txt
Sunday night: D1 FBS/FCS
Monday night: D2
Tuesday night: D3
Daily: retry fetch errors and user-reported bad emails
```

Possible schedulers:

- GitHub Actions
- Render cron job
- Railway cron
- Supabase scheduled Edge Function
- a small always-on worker process with `node-cron`

Do not run every few minutes. Athletics pages do not change that often, and aggressive crawling can get blocked.

## Phase 8: Safety Rules

The updater must support rollback.

Every applied change should record:

- old value
- new value
- source URL
- evidence
- confidence
- run ID
- timestamp
- whether Codex reviewed it

Never overwrite a manual correction unless the new evidence is reviewed.

Examples:

- If a user marks an email wrong, do not re-add it automatically.
- If a coach is manually marked inactive, do not reactivate them from a stale previous-season page.
- If the source page is filtered to an old season, require review.

## First Build Slice

When ready to build, start with this:

1. Convert the existing enrichment script into `server/src/agent/`.
2. Add `npm run agent:check-coaches`.
3. Write proposals to JSON only.
4. Add `--apply-safe`.
5. Add bad-email report storage.
6. Add Codex CLI review for `needs_review` proposals.
7. Add Supabase audit tables.
8. Add admin review UI.

The first production version should auto-apply only official-source direct email confirmations and send everything else to review.
