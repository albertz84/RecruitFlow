# Supabase Production Setup

RecruitFlow uses Supabase as the production database, but the browser should not query private tables directly.

## Architecture

```txt
Vercel React app -> Render Express API -> Supabase Postgres
```

The Render API owns the Supabase service-role key. Vercel only gets `VITE_API_BASE`.

## Create Tables

Open the Supabase SQL editor and run:

```txt
server/supabase/schema.sql
```

The schema enables row level security and intentionally creates no public read policies. The Render backend uses the service-role key and bypasses RLS.

## Import Seed Data

Set these in `server/.env` locally, or export them in your shell:

```txt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```bash
npm run import:supabase
```

This imports:

```txt
server/data/schools.json -> public.schools
server/data/coaches.json -> public.coaches
```

## Render Environment Variables

Set these on Render:

```txt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
SESSION_SECRET=long-random-string
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://recruitflow-api-tlk5.onrender.com/api/auth/google/callback
ADMIN_EMAILS=you@example.com
```

Do not set `SUPABASE_SERVICE_ROLE_KEY` on Vercel.

## Vercel Environment Variables

Set only:

```txt
VITE_API_BASE=https://recruitflow-api-tlk5.onrender.com
```

## Why Render Is Still Needed

Yes, you still need Render unless you replace the backend with Supabase Edge Functions or another secure server.

Render is doing private work:

- Holding the Supabase service-role key.
- Keeping coach emails and source data away from the browser.
- Running Google OAuth cookie sessions.
- Calling Gemini/Anthropic without exposing model API keys.
- Writing email history for the authenticated user.

If the frontend talked to Supabase directly, users could inspect network requests and reuse the public anon key. RLS can help, but the safer product architecture is to keep private recruiting data behind the backend.
