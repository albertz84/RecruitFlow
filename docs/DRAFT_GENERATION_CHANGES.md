# Draft Generation Changes

This version keeps the data model simple.

## What is stored

Stored data lives in:

```txt
Supabase tables: schools, coaches, users, emails
Seed fallback: server/data/schools.json and server/data/coaches.json
```

In production, Supabase stores connected Google users, saved athlete profile snapshots, user-facing email history rows, schools, and coaches.
The JSON files are retained as import seeds and local development fallback data.

## What is not used anymore

- Web-search enrichment
- Cache-backed school lookups
- Separate draft-history JSON storage as a product feature

The app now only generates emails from the saved school/coach database plus the athlete profile.

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
