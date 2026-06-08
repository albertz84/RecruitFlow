# Coach Database Guide

The database is the moat. The AI writer is easy to copy; verified staff/contact data is not.

## Minimum viable schema

| Field | Purpose |
|---|---|
| school | School name |
| division | D1 FBS, D1 FCS, D2, D3, NAIA, JUCO |
| conference | Helps users filter and understand fit |
| state/city | Useful for regional search |
| staffPageUrl | Best source for updating staff |
| questionnaireUrl | Useful when emails are missing |
| programSummary | Short factual program note for personalization |
| coachName | Full name |
| title | Determines role relevance |
| email | Leave blank if not verified |
| phone | Optional fallback |
| xHandle | Optional fallback |
| positionGroups | WR, OL, DB, Recruiting Coordinator, etc. |
| recruitingStates | TX, CA, National, etc. |
| sourceUrl | Exact source for verification |
| lastVerified | Date checked |
| confidence | high, medium, low |
| notes | Anything useful |

## Position targeting logic

The app scores coaches using:

1. Position fit
2. Recruiting/personnel title
3. Regional recruiting territory
4. Contact quality, especially verified email
5. Confidence level

Examples:

- WR: WR coach, pass game coordinator, recruiting coordinator, regional recruiter
- OL: offensive line coach, run game coordinator, recruiting coordinator
- DB: defensive backs/cornerbacks/safeties coach, defensive coordinator, recruiting coordinator
- K/P/LS: special teams coordinator, recruiting coordinator

## Manual collection speed

Manual collection estimates:

| Scope | Time |
|---|---:|
| 25 schools | 2-5 hours |
| 50 schools | 5-12 hours |
| 100 schools | 12-25 hours |
| FBS + FCS | 40-80 hours |
| D1 + D2 + D3 | 120-250+ hours |

## Workflow

1. Go to the official athletics staff page.
2. Add staff page URL and questionnaire URL.
3. Add the position coach for each position group.
4. Add recruiting coordinator / director of player personnel.
5. Add regional recruiters if listed.
6. Leave email blank unless verified.
7. Set confidence.
8. Re-verify every offseason.

## Suggested confidence labels

- high: official staff page lists title and email
- medium: official staff page lists title, but email is inferred or missing
- low: third-party source, stale page, or placeholder
