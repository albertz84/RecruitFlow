# API Reference

## GET /api/health

Returns server status and which draft provider is active.

## GET /api/stats

Returns database coverage counts.

## GET /api/schools?q=rice

Search local school database.

## GET /api/coaches?schoolId=school-id

Return coaches for one school.

## POST /api/admin/import-coaches

Body:

```json
{ "csvText": "school,division,..." }
```

Imports school and coach rows.

## POST /api/generate

Body:

```json
{
  "profile": { "firstName": "Albert", "position": "WR" },
  "schools": [{ "name": "Princeton University", "division": "D1 FCS" }],
  "options": {
    "allowWebResearch": false,
    "maxContacts": 3
  }
}
```

Returns one contact plan and fresh draft set per school. The draft text is saved to generated-drafts history, but it is not reused as a hard cache.

## POST /api/enrich-school

Body:

```json
{ "schoolName": "Example University", "division": "D3" }
```

Uses Anthropic web search if `ANTHROPIC_API_KEY` is set. This is intended for admin/fallback use, not every generation.


## POST /api/rewrite-draft

Body:

```json
{
  "profile": { "firstName": "Albert", "position": "WR" },
  "school": { "name": "Princeton University" },
  "contact": { "name": "Coach Name", "title": "Wide Receivers Coach" },
  "draft": { "email_subject": "...", "email_body": "..." },
  "action": "shorter"
}
```

Supported actions:

```txt
shorter
more_casual
more_confident
academic_focus
football_focus
dm_version
follow_up
```

Uses the configured draft provider. It does not use web search and does not read/write the enrichment cache.
