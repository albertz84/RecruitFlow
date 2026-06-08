import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const paths = {
  schools: path.join(DATA_DIR, "schools.json"),
  coaches: path.join(DATA_DIR, "coaches.json"),
  drafts: path.join(DATA_DIR, "generated-drafts.json"),
  cache: path.join(DATA_DIR, "cache.json")
};

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw || "null") ?? fallback;
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

function normalizeName(name = "") {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function getSchools() {
  return readJson(paths.schools, []);
}

export async function getCoaches() {
  return readJson(paths.coaches, []);
}

export async function getDrafts() {
  return readJson(paths.drafts, []);
}

export async function saveDraft(record) {
  const drafts = await getDrafts();
  const withId = { id: nanoid(), createdAt: new Date().toISOString(), ...record };
  drafts.unshift(withId);
  await writeJson(paths.drafts, drafts.slice(0, 1000));
  return withId;
}

export async function getCache() {
  return readJson(paths.cache, {});
}

export async function setCacheValue(key, value) {
  const cache = await getCache();
  cache[key] = { savedAt: new Date().toISOString(), value };
  await writeJson(paths.cache, cache);
}

export async function findSchoolByName(name) {
  const schools = await getSchools();
  const needle = normalizeName(name);
  return schools.find(s => normalizeName(s.name) === needle || normalizeName(s.shortName) === needle) || null;
}

export async function searchSchools(q = "") {
  const schools = await getSchools();
  const needle = normalizeName(q);
  if (!needle) return schools;
  return schools.filter(s => {
    const blob = [s.name, s.shortName, s.division, s.conference, s.state, s.city].join(" ");
    return normalizeName(blob).includes(needle);
  });
}

export async function addSchool(input) {
  const schools = await getSchools();
  const existing = schools.find(s => normalizeName(s.name) === normalizeName(input.name));
  if (existing) return existing;
  const record = {
    id: nanoid(),
    name: input.name,
    shortName: input.shortName || input.name,
    division: input.division || "Unknown",
    conference: input.conference || "",
    city: input.city || "",
    state: input.state || "",
    staffPageUrl: input.staffPageUrl || "",
    questionnaireUrl: input.questionnaireUrl || "",
    programSummary: input.programSummary || "",
    lastVerified: input.lastVerified || null,
    sourceUrl: input.sourceUrl || input.staffPageUrl || "",
    dataConfidence: input.dataConfidence || "low"
  };
  schools.push(record);
  await writeJson(paths.schools, schools);
  return record;
}

export async function upsertCoaches(records) {
  const coaches = await getCoaches();
  const byKey = new Map(coaches.map(c => [`${c.schoolId}|${normalizeName(c.name)}|${normalizeName(c.title)}`, c]));
  let inserted = 0;
  let updated = 0;
  for (const raw of records) {
    const key = `${raw.schoolId}|${normalizeName(raw.name)}|${normalizeName(raw.title)}`;
    const existing = byKey.get(key);
    if (existing) {
      Object.assign(existing, cleanCoach(raw), { updatedAt: new Date().toISOString() });
      updated++;
    } else {
      const record = {
        id: nanoid(),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...cleanCoach(raw)
      };
      coaches.push(record);
      byKey.set(key, record);
      inserted++;
    }
  }
  await writeJson(paths.coaches, coaches);
  return { inserted, updated, total: coaches.length };
}

function cleanCoach(raw) {
  return {
    schoolId: raw.schoolId,
    name: raw.name || "",
    title: raw.title || "",
    email: raw.email || "",
    phone: raw.phone || "",
    xHandle: raw.xHandle || raw.twitter || "",
    positionGroups: Array.isArray(raw.positionGroups) ? raw.positionGroups : parseList(raw.positionGroups),
    recruitingStates: Array.isArray(raw.recruitingStates) ? raw.recruitingStates : parseList(raw.recruitingStates),
    sourceUrl: raw.sourceUrl || "",
    lastVerified: raw.lastVerified || null,
    confidence: raw.confidence || "medium",
    notes: raw.notes || "",
    active: raw.active !== false
  };
}

export function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  return String(value)
    .split(/[|,;/]/g)
    .map(s => s.trim())
    .filter(Boolean);
}

export async function coachesForSchool(schoolId) {
  const coaches = await getCoaches();
  return coaches.filter(c => c.schoolId === schoolId && c.active !== false);
}

export { normalizeName, paths };
