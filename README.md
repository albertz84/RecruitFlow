# RecruitFlow

RecruitFlow is a football recruiting outreach assistant for athletes. It uses a local school and coach database first, ranks the best contacts for a player's profile, then generates editable outreach emails.

The main cost-saving idea is simple:

```txt
target school -> saved coach database -> contact ranking -> draft emails
                                      -> optional paid research only when needed
```

The app can run without any model API key by using local email templates. Add Gemini or Anthropic keys only when you want AI-written drafts, rewrite buttons, or paid web-search enrichment.

## Features

- React/Vite frontend
- Node/Express backend
- Local JSON school and coach database
- CSV import for coach records
- Position-specific contact ranking
- Multiple coach contacts per school
- Editable generated email drafts
- Rewrite actions for tone, length, academics, football focus, DMs, and follow-ups
- Local template fallback when no API key is configured
- Optional Gemini draft writing
- Optional Anthropic draft writing and web-search enrichment

## Project Structure

```txt
RecruitFlow/
  client/                 React frontend
    src/
    .env.example          Optional frontend API URL template
  server/                 Express backend
    src/
    data/
      schools.json        Seed school database
      coaches.json        Seed coach database
  docs/                   API and database notes
  templates/              CSV import template
  .env.example            Backend env template
```

## Requirements

- Node.js 18+
- npm

## Setup

Install dependencies from the project root:

```bash
npm run install:all
```

Create your backend environment file:

```bash
cp .env.example server/.env
```

Run the full app:

```bash
npm run dev
```

Open the frontend:

```txt
http://localhost:5173
```

The backend runs at:

```txt
http://localhost:8787
```

## Environment Variables

The backend reads `server/.env`. Start from the root `.env.example`.

Useful defaults:

```txt
PORT=8787
HOST=127.0.0.1
CLIENT_ORIGIN=http://localhost:5173
DRAFT_PROVIDER=auto
```

Draft writing options:

```txt
GEMINI_API_KEY=
GEMINI_DRAFT_MODEL=gemini-2.5-flash-lite

ANTHROPIC_API_KEY=
ANTHROPIC_DRAFT_MODEL=claude-sonnet-4-20250514
ANTHROPIC_RESEARCH_MODEL=claude-sonnet-4-20250514
```

Cost controls:

```txt
ALLOW_WEB_RESEARCH_DEFAULT=false
MAX_WEB_SEARCH_USES_PER_SCHOOL=2
MAX_CONTACTS_PER_SCHOOL=3
```

The frontend usually does not need an env file in local development. For a deployed frontend, copy `client/.env.example` to `client/.env` and set:

```txt
VITE_API_BASE=https://your-api-host.example.com
```

## Running Without API Keys

RecruitFlow works with no API keys. If no draft provider is configured, the backend uses `local-template` mode and creates editable outreach drafts from the player profile, selected school, and saved coach data.

## Data Files

The useful seed database files are:

```txt
server/data/schools.json
server/data/coaches.json
```

Generated runtime files are ignored by Git:

```txt
server/data/cache.json
server/data/generated-drafts.json
```

Those files are recreated as the app runs.

## CSV Import

Use the template at:

```txt
templates/coach_import_template.csv
```

Important columns:

- `school`
- `division`
- `conference`
- `staffPageUrl`
- `questionnaireUrl`
- `programSummary`
- `coachName`
- `title`
- `email`
- `xHandle`
- `positionGroups`
- `recruitingStates`
- `sourceUrl`
- `lastVerified`
- `confidence`

Use `|` separators for list fields:

```txt
WR|Wide Receivers|Pass Game
TX|OK|LA
```

Do not add fake real coach emails. If an email is not verified, leave it blank and use staff pages, questionnaires, phone numbers, or social handles as fallbacks.

## Build

Build the frontend:

```bash
npm run build --prefix client
```

Start the backend in production mode:

```bash
npm start
```

## GitHub Checklist

Before pushing publicly:

- Confirm `server/.env` is not committed.
- Confirm API keys are not present in committed files.
- Keep `node_modules/` and `client/dist/` out of Git.
- Keep `server/data/schools.json` and `server/data/coaches.json` if you want to publish the seed database.
- Review coach contact data for accuracy before publishing.

## License

MIT
