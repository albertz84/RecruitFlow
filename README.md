# RecruitFlow

RecruitFlow is a football recruiting outreach assistant for athletes. It uses a local school and coach database first, ranks the best contacts for a player's profile, then generates editable outreach emails.

The main cost-saving idea is simple:

```txt
target school -> saved coach database -> contact ranking -> draft emails
```

The app can run without any model API key by using local email templates. Add Gemini or Anthropic keys only when you want AI-written drafts or rewrite buttons.

## Features

- React/Vite frontend
- Node/Express backend
- Local JSON school and coach database
- CSV import for coach records
- Position-specific contact ranking
- Multiple coach contacts per school
- Editable generated email drafts
- Rewrite actions for tone, length, academics, football focus, DMs, and follow-ups
- Google OAuth login with HTTP-only signed sessions
- Per-user saved athlete profile and email history
- Local template fallback when no API key is configured
- Optional Gemini draft writing
- Optional Anthropic draft writing

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

- Node.js 24+
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
http://localhost:3000
```

## Environment Variables

The backend reads `server/.env`. Start from the root `.env.example`.

Useful defaults:

```txt
PORT=3000
HOST=0.0.0.0
CLIENT_ORIGIN=http://localhost:5173
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
SESSION_SECRET=change-this-to-a-long-random-string
DRAFT_PROVIDER=auto
```

Google login:

```txt
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=you@gmail.com
```

Create a Google Cloud OAuth 2.0 Client ID for a web application. For local development, add this authorized redirect URI:

```txt
http://localhost:3000/api/auth/google/callback
```

For production, use your API domain instead:

```txt
https://api.yourdomain.com/api/auth/google/callback
```

Then set:

```txt
CLIENT_ORIGIN=https://yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/auth/google/callback
```

Supabase production database:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Keep `SUPABASE_SERVICE_ROLE_KEY` on the Render backend only. Do not add it to Vercel.

Draft writing options:

```txt
GEMINI_API_KEY=
GEMINI_DRAFT_MODEL=gemini-2.5-flash-lite

ANTHROPIC_API_KEY=
ANTHROPIC_DRAFT_MODEL=claude-sonnet-4-20250514
MAX_CONTACTS_PER_SCHOOL=3
```

The frontend usually does not need an env file in local development. For a deployed frontend, copy `client/.env.example` to `client/.env` and set:

```txt
VITE_API_BASE=https://your-api-host.example.com
```

## Running Without API Keys

RecruitFlow works with no API keys. If no draft provider is configured, the backend uses `local-template` mode and creates editable outreach drafts from the player profile, selected school, and saved coach data.

## Data Storage

Production data lives in Supabase Postgres. Create the tables with:

```txt
server/supabase/schema.sql
```

Then import the current seed data:

```bash
npm run import:supabase
```

The useful local seed files are still kept in Git:

```txt
server/data/schools.json
server/data/coaches.json
```

If Supabase env vars are missing, the backend falls back to those JSON files for schools/coaches and in-memory user/history storage for local development. Production should use Supabase.

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

## Deployment Notes

For a public deployment, leave `PORT` unset on Render, set `HOST=0.0.0.0` or omit it, use a real `SESSION_SECRET`, and set `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` on Render.

The frontend must call the deployed backend:

```txt
VITE_API_BASE=https://api.yourdomain.com
```

Google login uses an HTTP-only cookie, so the frontend fetches API requests with credentials enabled. Keep the frontend domain in `CLIENT_ORIGIN` so CORS allows those authenticated requests.

## GitHub Checklist

Before pushing publicly:

- Confirm `server/.env` is not committed.
- Confirm API keys are not present in committed files.
- Keep `node_modules/` and `client/dist/` out of Git.
- Keep `server/data/schools.json` and `server/data/coaches.json` if you want to publish the seed database.
- Review coach contact data for accuracy before publishing.

## License

MIT
