# API Reference

## GET /api/health

Returns server status and which draft provider is active.

## GET /api/auth/google

Starts Google OAuth login. Redirects the browser to Google.

## GET /api/auth/google/callback

Google OAuth callback. Verifies the returned ID token, creates or updates the user, sets an HTTP-only signed session cookie, then redirects back to `CLIENT_ORIGIN`.

## GET /api/auth/me

Returns the currently signed-in user from the session cookie.

```json
{ "configured": true, "user": { "email": "athlete@gmail.com", "name": "Athlete Name" } }
```

## POST /api/auth/logout

Clears the session cookie.

## GET /api/stats

Returns database coverage counts.

## GET /api/schools?q=rice

Requires Google login. Searches the school database and returns limited school summary fields only.

## GET /api/coaches?schoolId=school-id

Requires Google login and admin access. Returns coach records for admin/database maintenance only.

## POST /api/schools

Requires Google login and admin access. Adds a school record.

## POST /api/admin/import-coaches

Requires a signed-in Google user whose email is listed in `ADMIN_EMAILS`.

Body:

```json
{ "csvText": "school,division,..." }
```

Imports school and coach rows.

## POST /api/generate

Requires Google login. The server uses the authenticated session user for saved history; it does not trust a browser-supplied email address.

Body:

```json
{
  "profile": { "firstName": "Albert", "position": "WR" },
  "schools": [{ "name": "Princeton University", "division": "D1 FCS" }]
}
```

Returns one contact plan and fresh draft set per school.

## POST /api/rewrite-draft

Requires Google login.

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

Uses the configured draft provider and does not use web search.
