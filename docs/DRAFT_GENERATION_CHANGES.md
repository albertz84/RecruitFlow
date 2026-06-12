# Draft Generation Changes

This version keeps the data model simple.

## What is stored

Stored data lives in:

```txt
server/data/schools.json
server/data/coaches.json
server/data/recruitflow.sqlite
```

`schools.json` and `coaches.json` are the local school database.
`recruitflow.sqlite` stores connected Gmail users, saved athlete profile snapshots, and user-facing email history rows.

## What is not used anymore

- Web-search enrichment
- Cache-backed school lookups
- Separate draft-history JSON storage as a product feature

The app now only generates emails from the local school JSON data plus the athlete profile.

## Why

This keeps the workflow predictable and removes the parts that are expensive, hard to verify, or unnecessary for the MVP.

## Rewrite buttons

The frontend still supports:

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
