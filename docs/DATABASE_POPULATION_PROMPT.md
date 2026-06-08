# RecruitFlow Database Population Prompt

Paste this into ChatGPT/Codex when you want help building verified school and coach data for RecruitFlow.

```txt
You are helping me populate the local database for a project called RecruitFlow.

Project context:
- Schools live in server/data/schools.json.
- Coaches live in server/data/coaches.json.
- The app ranks contacts by coach title, positionGroups, recruitingStates, and data confidence.
- The email generator personalizes outreach using school.programSummary, staffPageUrl, questionnaireUrl, conference, city/state, coach title, positionGroups, recruitingStates, and sourceUrl.
- Do not invent real coach emails. If an email is not clearly verified from an official or credible source, leave it blank.

Task:
Research and produce verified data for these schools:
[PASTE SCHOOL LIST HERE]

For each school, find:
- official school name
- shortName
- football division
- conference
- city
- state
- official football staff page URL
- recruiting questionnaire URL if available
- sourceUrl
- lastVerified as today's date in YYYY-MM-DD format
- dataConfidence: high, medium, or low
- programSummary: 2-4 factual, email-useful sentences. Include specific details that can help personalize recruiting emails, such as academic fit, location, conference/division, program identity, recruiting questionnaire, or other stable program facts. Do not mention unverified records, recent staff changes, schemes, or claims that may become stale unless sourced.

For each school, find the most useful football recruiting contacts:
- head coach if useful
- recruiting coordinator / director of recruiting / director of player personnel
- position coach for WR if available
- offensive coordinator / pass game coordinator if useful
- regional recruiter for TX/Houston if available

For each coach, provide:
- schoolId matching the school record id
- name
- title
- email, but only if verified; otherwise blank string
- phone if verified; otherwise blank string
- xHandle if verified; otherwise blank string
- positionGroups as an array, for example ["WR", "Wide Receivers", "Pass Game", "Recruiting Coordinator"]
- recruitingStates as an array, for example ["TX"] or ["National"]; leave [] if not known
- sourceUrl where the staff/contact info was found
- lastVerified as YYYY-MM-DD
- confidence: high, medium, or low
- notes: short verification note
- active: true

Return two JSON arrays only:

1. schools.json additions:
[
  {
    "id": "lowercase-stable-id",
    "name": "",
    "shortName": "",
    "division": "",
    "conference": "",
    "city": "",
    "state": "",
    "staffPageUrl": "",
    "questionnaireUrl": "",
    "programSummary": "",
    "lastVerified": "YYYY-MM-DD",
    "sourceUrl": "",
    "dataConfidence": "high|medium|low"
  }
]

2. coaches.json additions:
[
  {
    "id": "lowercase-stable-id",
    "schoolId": "matching-school-id",
    "name": "",
    "title": "",
    "email": "",
    "phone": "",
    "xHandle": "",
    "positionGroups": [],
    "recruitingStates": [],
    "sourceUrl": "",
    "lastVerified": "YYYY-MM-DD",
    "confidence": "high|medium|low",
    "notes": "",
    "active": true
  }
]

Quality rules:
- Prefer official athletics staff pages.
- Never fabricate emails, phone numbers, recruiting territories, or coach roles.
- Use blank strings or empty arrays when data is not verified.
- Make programSummary useful for email personalization but factual and conservative.
- Do not include markdown explanation before or after the JSON arrays.
```

CSV import alternative:

```txt
Create CSV rows compatible with templates/coach_import_template.csv for the same schools and coaches. Include the header row. Use | separators for positionGroups and recruitingStates. Leave unverified emails blank.
```
