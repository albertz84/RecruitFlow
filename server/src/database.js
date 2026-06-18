import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DATABASE_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(DATA_DIR, "recruitflow.sqlite");
const paths = {
  schools: path.join(DATA_DIR, "schools.json"),
  coaches: path.join(DATA_DIR, "coaches.json"),
  database: DATABASE_PATH
};

fsSync.mkdirSync(DATA_DIR, { recursive: true });
fsSync.mkdirSync(path.dirname(paths.database), { recursive: true });

const db = new DatabaseSync(paths.database);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    gmail_email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gmail-compose-mvp',
    profile_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated',
    athlete_name TEXT,
    school_id TEXT,
    school_name TEXT,
    school_division TEXT,
    school_conference TEXT,
    coach_id TEXT,
    coach_name TEXT,
    coach_title TEXT,
    coach_email TEXT,
    coach_x_handle TEXT,
    coach_x_url TEXT,
    email_subject TEXT NOT NULL DEFAULT '',
    email_body TEXT NOT NULL DEFAULT '',
    email_lookup_tip TEXT,
    provider TEXT,
    profile_json TEXT,
    generated_at TEXT,
    opened_at TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_emails_user_created ON emails (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (gmail_email);
`);

for (const statement of [
  "ALTER TABLE users ADD COLUMN google_sub TEXT",
  "ALTER TABLE users ADD COLUMN picture_url TEXT",
  "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0"
]) {
  try { db.exec(statement); } catch (err) {
    if (!String(err.message || "").includes("duplicate column name")) throw err;
  }
}

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL AND google_sub != ''");

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

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function stringifyJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.gmail_email,
    name: row.name,
    provider: row.provider,
    googleSub: row.google_sub || "",
    pictureUrl: row.picture_url || "",
    emailVerified: Boolean(row.email_verified),
    profileSnapshot: parseJson(row.profile_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  };
}

function mapEmail(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    userEmail: row.gmail_email,
    userName: row.user_name,
    athleteName: row.athlete_name || "",
    profileSnapshot: parseJson(row.profile_json, null),
    school: {
      id: row.school_id || "",
      name: row.school_name || "",
      division: row.school_division || "",
      conference: row.school_conference || ""
    },
    coach: {
      id: row.coach_id || "",
      name: row.coach_name || "",
      title: row.coach_title || "",
      email: row.coach_email || null,
      xHandle: row.coach_x_handle || "",
      xUrl: row.coach_x_url || ""
    },
    email_subject: row.email_subject || "",
    email_body: row.email_body || "",
    email_lookup_tip: row.email_lookup_tip || "",
    provider: row.provider || "",
    generatedAt: row.generated_at,
    openedAt: row.opened_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getSchools() {
  return readJson(paths.schools, []);
}

export async function getCoaches() {
  return readJson(paths.coaches, []);
}

export async function getUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all().map(mapUser);
}

export async function getUserByEmail(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return null;
  return mapUser(db.prepare("SELECT * FROM users WHERE gmail_email = ?").get(email));
}

export async function upsertUser(input = {}) {
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM users WHERE gmail_email = ?").get(email);
  if (existing) {
    const profile = existing.profile_json || stringifyJson(input.profileSnapshot);
    db.prepare(`
      UPDATE users
      SET name = ?, provider = ?, google_sub = ?, picture_url = ?, email_verified = ?, profile_json = ?, updated_at = ?, last_seen_at = ?
      WHERE id = ?
    `).run(
      input.name || existing.name || email.split("@")[0],
      input.provider || existing.provider || "gmail-compose-mvp",
      input.googleSub || existing.google_sub || "",
      input.pictureUrl || existing.picture_url || "",
      input.emailVerified === true ? 1 : Number(existing.email_verified || 0),
      profile,
      now,
      now,
      existing.id
    );
    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id));
  }
  const user = {
    id: nanoid(),
    gmail_email: email,
    name: input.name || email.split("@")[0],
    provider: input.provider || "gmail-compose-mvp",
    google_sub: input.googleSub || "",
    picture_url: input.pictureUrl || "",
    email_verified: input.emailVerified === true ? 1 : 0,
    profile_json: stringifyJson(input.profileSnapshot || null),
    created_at: now,
    updated_at: now,
    last_seen_at: now
  };
  db.prepare(`
    INSERT INTO users (
      id, gmail_email, name, provider, google_sub, picture_url, email_verified, profile_json,
      created_at, updated_at, last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.gmail_email,
    user.name,
    user.provider,
    user.google_sub,
    user.picture_url,
    user.email_verified,
    user.profile_json,
    user.created_at,
    user.updated_at,
    user.last_seen_at
  );
  return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id));
}

export async function updateUserProfile(userEmail, profileSnapshot = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid user email is required.");
  const now = new Date().toISOString();
  let user = db.prepare("SELECT * FROM users WHERE gmail_email = ?").get(email);
  if (!user) {
    return upsertUser({ email, profileSnapshot, provider: "gmail-compose-mvp" });
  }
  db.prepare("UPDATE users SET profile_json = ?, updated_at = ?, last_seen_at = ? WHERE id = ?")
    .run(stringifyJson(profileSnapshot || {}), now, now, user.id);
  return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id));
}

export async function getEmailHistory() {
  return db.prepare(`
    SELECT emails.*, users.gmail_email, users.name AS user_name
    FROM emails
    JOIN users ON users.id = emails.user_id
    ORDER BY emails.created_at DESC
  `).all().map(mapEmail);
}

export async function saveEmailHistoryEntries(entries = []) {
  const now = new Date().toISOString();
  const inserted = [];
  const insert = db.prepare(`
    INSERT INTO emails (
      id, user_id, status, athlete_name, school_id, school_name, school_division, school_conference,
      coach_id, coach_name, coach_title, coach_email, coach_x_handle, coach_x_url,
      email_subject, email_body, email_lookup_tip, provider, profile_json, generated_at,
      opened_at, sent_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN");
  try {
    for (const entry of entries) {
      const user = await upsertUser({
        email: entry.userEmail,
        name: entry.userName,
        profileSnapshot: entry.profileSnapshot,
        provider: "gmail-compose-mvp"
      });
      const id = nanoid();
      insert.run(
        id,
        user.id,
        entry.status || "generated",
        entry.athleteName || "",
        entry.school?.id || "",
        entry.school?.name || "",
        entry.school?.division || "",
        entry.school?.conference || "",
        entry.coach?.id || "",
        entry.coach?.name || "",
        entry.coach?.title || "",
        entry.coach?.email || null,
        entry.coach?.xHandle || "",
        entry.coach?.xUrl || "",
        entry.email_subject || "",
        entry.email_body || "",
        entry.email_lookup_tip || "",
        entry.provider || "",
        stringifyJson(entry.profileSnapshot || null),
        entry.generatedAt || now,
        entry.openedAt || null,
        entry.sentAt || null,
        entry.createdAt || now,
        entry.updatedAt || now
      );
      inserted.push(mapEmail(db.prepare(`
        SELECT emails.*, users.gmail_email, users.name AS user_name
        FROM emails
        JOIN users ON users.id = emails.user_id
        WHERE emails.id = ?
      `).get(id)));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return inserted;
}

export async function listEmailHistory(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return [];
  return db.prepare(`
    SELECT emails.*, users.gmail_email, users.name AS user_name
    FROM emails
    JOIN users ON users.id = emails.user_id
    WHERE users.gmail_email = ?
    ORDER BY emails.created_at DESC
  `).all(email).map(mapEmail);
}

export async function updateEmailHistoryItem(id, userEmail, updates = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  const existing = db.prepare(`
    SELECT emails.*
    FROM emails
    JOIN users ON users.id = emails.user_id
    WHERE emails.id = ? AND users.gmail_email = ?
  `).get(id, email);
  if (!existing) return null;
  const next = {
    status: updates.status || existing.status,
    email_subject: typeof updates.email_subject === "string" ? updates.email_subject : existing.email_subject,
    email_body: typeof updates.email_body === "string" ? updates.email_body : existing.email_body,
    opened_at: updates.openedAt || existing.opened_at,
    sent_at: updates.sentAt || existing.sent_at,
    updated_at: new Date().toISOString()
  };
  db.prepare(`
    UPDATE emails
    SET status = ?, email_subject = ?, email_body = ?, opened_at = ?, sent_at = ?, updated_at = ?
    WHERE id = ?
  `).run(next.status, next.email_subject, next.email_body, next.opened_at, next.sent_at, next.updated_at, id);
  return mapEmail(db.prepare(`
    SELECT emails.*, users.gmail_email, users.name AS user_name
    FROM emails
    JOIN users ON users.id = emails.user_id
    WHERE emails.id = ?
  `).get(id));
}

export async function deleteEmailHistoryItem(id, userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  const result = db.prepare(`
    DELETE FROM emails
    WHERE id = ? AND user_id = (SELECT id FROM users WHERE gmail_email = ?)
  `).run(id, email);
  return result.changes > 0;
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
