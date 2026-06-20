# RecruitFlow Data Agent

This directory is a planning area for an automated coach-data maintenance agent. It is not runtime code yet.

The goal is to keep `server/data/coaches.json` and the future Supabase coach tables current by continuously checking official athletics sources for:

- current staff membership
- coach titles and roles
- direct coach emails
- phone numbers
- X handles
- source URLs
- stale, bounced, or user-reported bad emails

## Can this just use a Codex subscription and Codex CLI prompts?

Mostly yes for the agentic reasoning layer, but not as the only system.

A good version would use Codex CLI calls to inspect fetched source pages, reason about ambiguous staff changes, and produce structured proposed updates. The Codex CLI should not be the only thing touching the database directly.

The safer architecture is:

```txt
scheduled job
  -> deterministic crawler/extractor
  -> Codex CLI review for ambiguous cases
  -> confidence scoring
  -> proposed changes
  -> auto-apply only safe changes
  -> review queue for risky changes
  -> audit log
```

Codex is useful for judgment-heavy work:

- deciding whether two slightly different names are the same person
- reading messy staff pages
- noticing when an email belongs to a neighboring staff row
- explaining why a coach should be marked inactive
- producing a clean patch or JSON update proposal

Deterministic code should still handle the mechanical checks:

- fetching pages
- parsing `mailto:` links
- decoding Cloudflare email protection
- validating email syntax
- checking domains
- comparing old vs new records
- writing audit logs
- enforcing confidence thresholds

## Important rule

Do not let the agent invent or guess confirmed emails.

An email should be marked confirmed only when it appears on a trusted source, usually an official athletics staff page, coach bio page, university directory, or verified staff listing. Pattern guesses can be saved as suggestions, but they should not be used as confirmed contact data.

## Recommended operating model

Use three lanes.

`auto_apply`

Changes that can be written automatically:

- existing email is still present on an official page near the coach name
- new email appears on an official page or bio page near the coach name
- email local-part resembles the coach name, such as `jdoe`, `john.doe`, `doej`, or similar
- source URL is official
- no known bad-email report exists for that address

`needs_review`

Changes that should wait for approval:

- coach appears to have left a staff
- official page conflicts with a user report
- email is near the name but looks like another staff member
- source is a PDF, cached page, old roster, or non-official directory
- title changed substantially
- school moved pages or has multiple conflicting staff pages

`reject`

Never apply automatically:

- guessed emails
- generic emails like `football@`, `athletics@`, `tickets@`, or `info@`
- emails found only in snippets without source context
- emails attached to another staff member
- addresses already reported bad by users

## Codex CLI prompt shape

The agent should call Codex with narrow, structured tasks. Example:

```txt
You are verifying one RecruitFlow coach record.

Coach:
{coach_json}

Trusted source HTML/text:
{source_excerpt}

Known bad emails:
{bad_email_reports}

Return only JSON:
{
  "decision": "auto_apply" | "needs_review" | "reject",
  "updates": {
    "email": string | null,
    "title": string | null,
    "active": boolean | null,
    "sourceUrl": string | null
  },
  "confidence": 0.0-1.0,
  "reason": string,
  "evidence": string
}
```

Keep each Codex request small. One coach or one school at a time is easier to audit than asking for the entire database at once.

## What should exist before building

Before this becomes production automation, add:

- a `coach_data_runs` table
- a `coach_data_change_proposals` table
- a `coach_bad_email_reports` table
- an admin review page
- a weekly scheduled job
- a command that can run one school at a time
- a way to roll back a run

See `PLAN.md` for the implementation roadmap.
