import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

await loadEnvFile(path.join(ROOT, ".env"));
await loadEnvFile(path.join(ROOT, "server", ".env"));

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing data.");
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8"));
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function upsert(table, rows, onConflict = "id") {
  let count = 0;
  for (const chunk of chunks(rows, 500)) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("on_conflict", onConflict);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(chunk)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed importing ${table}: ${response.status} ${text}`);
    }
    count += chunk.length;
    console.log(`Imported ${count}/${rows.length} ${table}`);
  }
}

function schoolRow(school) {
  return {
    id: school.id,
    name: school.name || "",
    short_name: school.shortName || school.name || "",
    division: school.division || "",
    conference: school.conference || "",
    city: school.city || "",
    state: school.state || "",
    staff_page_url: school.staffPageUrl || "",
    questionnaire_url: school.questionnaireUrl || "",
    program_summary: school.programSummary || "",
    last_verified: school.lastVerified || null,
    source_url: school.sourceUrl || school.staffPageUrl || "",
    data_confidence: school.dataConfidence || "low"
  };
}

function coachRow(coach) {
  return {
    id: coach.id,
    school_id: coach.schoolId,
    name: coach.name || "",
    title: coach.title || "",
    email: coach.email || "",
    phone: coach.phone || "",
    x_handle: coach.xHandle || coach.twitter || "",
    position_groups: Array.isArray(coach.positionGroups) ? coach.positionGroups : [],
    recruiting_states: Array.isArray(coach.recruitingStates) ? coach.recruitingStates : [],
    source_url: coach.sourceUrl || "",
    last_verified: coach.lastVerified || null,
    confidence: coach.confidence || "medium",
    notes: coach.notes || "",
    active: coach.active !== false
  };
}

const schools = (await readJson("server/data/schools.json")).map(schoolRow);
const coaches = (await readJson("server/data/coaches.json")).map(coachRow);

await upsert("schools", schools);
await upsert("coaches", coaches);

console.log(`Done. Imported ${schools.length} schools and ${coaches.length} coaches.`);
