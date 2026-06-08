# Review of Original MVP

The original MVP had the right user-facing workflow:

- Athlete profile form
- Target school list
- Generate button
- Per-school draft cards
- Inline editing
- Copy full email/body/subject
- Regenerate individual school

The main architectural issue was cost and reliability. The frontend made one model call per school and asked the model to search the web for staff/contact/program info and write the email in the same call. That is workable for a demo but expensive and slow for a product.

## v2 architectural changes

| Original | v2 |
|---|---|
| Frontend calls Anthropic directly | Backend proxy hides keys |
| Search every school live | Local database first |
| One coach per school | Ranked contact plan with multiple coaches |
| Recruiting coordinator preferred by default | Position coach + regional recruiter + recruiting/personnel logic |
| Web search and writing in one call | Separate enrichment from draft writing |
| No persistence | Local JSON data, draft logs, cache |
| No admin workflow | CSV import for coach database |

## Why this matters

The product gets much stronger when the database is treated as the core asset. Coach emails and staff roles are the hard part. AI writing is useful, but not defensible by itself.
