# Draft Generation Changes

This version separates the expensive part from the cheap part.

## What is cached

Cached/saved:

- School records
- Coach records
- Coach emails
- Staff page URLs
- Recruiting questionnaire URLs
- Anthropic web-search enrichment results

These live in:

```txt
server/data/schools.json
server/data/coaches.json
server/data/cache.json
```

## What is not cached anymore

Generated email text is not reused as a hard cache anymore.

Every time the user clicks generate, the backend creates a fresh draft using the configured draft provider:

```txt
DRAFT_PROVIDER=gemini | anthropic | local | auto
```

Generated drafts are still saved as history in:

```txt
server/data/generated-drafts.json
```

That file is for audit/history, not for avoiding model calls.

## Why

Coach/school research is the hard and expensive part. Email writing is cheap once the app already has the athlete profile, school info, and recommended contacts.

## Rewrite buttons

The frontend now supports:

```txt
Make shorter
More casual
More confident
Academic focus
Football focus
DM version
Follow-up
```

These call:

```txt
POST /api/rewrite-draft
```

Rewrites do not use web search. They only use the configured draft-writing provider.
