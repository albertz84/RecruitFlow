import { addSchool, findSchoolByName, upsertCoaches, parseList } from "./database.js";

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function parseCsv(text) {
  const rows = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(splitCsvLine);

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ""])));
}

export async function importCoachCsv(text) {
  const rows = parseCsv(text);
  const coachesToUpsert = [];
  const createdSchools = [];

  for (const row of rows) {
    const schoolName = row.school || row.School || row.schoolName || row.school_name;
    if (!schoolName) continue;
    let school = await findSchoolByName(schoolName);
    if (!school) {
      school = await addSchool({
        name: schoolName,
        division: row.division || row.Division || "",
        conference: row.conference || row.Conference || "",
        city: row.city || row.City || "",
        state: row.state || row.State || "",
        staffPageUrl: row.staffPageUrl || row.staff_page_url || row.sourceUrl || row.source_url || "",
        questionnaireUrl: row.questionnaireUrl || row.questionnaire_url || "",
        programSummary: row.programSummary || row.program_summary || "",
        sourceUrl: row.sourceUrl || row.source_url || "",
        dataConfidence: row.schoolConfidence || row.dataConfidence || "medium"
      });
      createdSchools.push(school);
    }

    const coachName = row.coachName || row.coach_name || row.name || row.Name;
    if (!coachName) continue;
    coachesToUpsert.push({
      schoolId: school.id,
      name: coachName,
      title: row.title || row.coachTitle || row.coach_title || "",
      email: row.email || row.coachEmail || row.coach_email || "",
      phone: row.phone || "",
      xHandle: row.xHandle || row.twitter || row.x || "",
      positionGroups: parseList(row.positionGroups || row.position_groups || row.position || ""),
      recruitingStates: parseList(row.recruitingStates || row.recruiting_states || row.region || ""),
      sourceUrl: row.sourceUrl || row.source_url || row.staffPageUrl || row.staff_page_url || "",
      lastVerified: row.lastVerified || row.last_verified || new Date().toISOString().slice(0, 10),
      confidence: row.confidence || "medium",
      notes: row.notes || ""
    });
  }

  const result = await upsertCoaches(coachesToUpsert);
  return { rows: rows.length, createdSchools: createdSchools.length, ...result };
}
