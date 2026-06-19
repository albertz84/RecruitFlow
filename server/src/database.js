import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const paths = {
  schools: path.join(DATA_DIR, "schools.json"),
  coaches: path.join(DATA_DIR, "coaches.json")
};

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_PAGE_SIZE = 1000;
const STARTING_CREDITS = 25;

const memoryUsers = new Map();
const memoryEmails = [];

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
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseJson(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function xUrl(handle = "") {
  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  return cleanHandle ? `https://x.com/${cleanHandle}` : "";
}

function mapSchool(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    shortName: row.short_name || row.shortName || row.name || "",
    division: row.division || "",
    conference: row.conference || "",
    city: row.city || "",
    state: row.state || "",
    staffPageUrl: row.staff_page_url || row.staffPageUrl || "",
    questionnaireUrl: row.questionnaire_url || row.questionnaireUrl || "",
    programSummary: row.program_summary || row.programSummary || "",
    lastVerified: row.last_verified || row.lastVerified || null,
    sourceUrl: row.source_url || row.sourceUrl || "",
    dataConfidence: row.data_confidence || row.dataConfidence || "low",
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function toSchoolRow(school) {
  return {
    id: school.id,
    name: school.name || "",
    short_name: school.shortName || school.short_name || school.name || "",
    division: school.division || "Unknown",
    conference: school.conference || "",
    city: school.city || "",
    state: school.state || "",
    staff_page_url: school.staffPageUrl || school.staff_page_url || "",
    questionnaire_url: school.questionnaireUrl || school.questionnaire_url || "",
    program_summary: school.programSummary || school.program_summary || "",
    last_verified: school.lastVerified || school.last_verified || null,
    source_url: school.sourceUrl || school.source_url || school.staffPageUrl || "",
    data_confidence: school.dataConfidence || school.data_confidence || "low",
    updated_at: new Date().toISOString()
  };
}

function publicSchool(school) {
  return {
    id: school.id,
    name: school.name,
    shortName: school.shortName,
    division: school.division,
    conference: school.conference,
    city: school.city,
    state: school.state
  };
}

function mapCoach(row) {
  if (!row) return null;
  const handle = row.x_handle || row.xHandle || row.twitter || "";
  return {
    id: row.id,
    schoolId: row.school_id || row.schoolId || "",
    name: row.name || "",
    title: row.title || "",
    email: row.email || "",
    phone: row.phone || "",
    xHandle: handle,
    xUrl: row.x_url || row.xUrl || xUrl(handle),
    positionGroups: parseList(row.position_groups || row.positionGroups || []),
    recruitingStates: parseList(row.recruiting_states || row.recruitingStates || []),
    sourceUrl: row.source_url || row.sourceUrl || "",
    lastVerified: row.last_verified || row.lastVerified || null,
    confidence: row.confidence || "medium",
    notes: row.notes || "",
    active: row.active !== false,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
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

function toCoachRow(coach) {
  const cleaned = cleanCoach(coach);
  return {
    id: coach.id,
    school_id: cleaned.schoolId,
    name: cleaned.name,
    title: cleaned.title,
    email: cleaned.email,
    phone: cleaned.phone,
    x_handle: cleaned.xHandle,
    position_groups: cleaned.positionGroups,
    recruiting_states: cleaned.recruitingStates,
    source_url: cleaned.sourceUrl,
    last_verified: cleaned.lastVerified,
    confidence: cleaned.confidence,
    notes: cleaned.notes,
    active: cleaned.active,
    updated_at: new Date().toISOString()
  };
}

function mapUser(row) {
  if (!row) return null;
  const credits = Number(row.credits_remaining);
  return {
    id: row.id,
    email: row.gmail_email,
    name: row.name,
    provider: row.provider,
    googleSub: row.google_sub || "",
    pictureUrl: row.picture_url || "",
    emailVerified: Boolean(row.email_verified),
    creditsRemaining: Number.isFinite(credits) ? credits : STARTING_CREDITS,
    profileSnapshot: parseJson(row.profile_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  };
}

function userRowFromInput(input, existing = null) {
  const email = String(input.email || existing?.gmail_email || "").trim().toLowerCase();
  const now = new Date().toISOString();
  return {
    id: existing?.id || input.id || nanoid(),
    gmail_email: email,
    name: input.name || existing?.name || email.split("@")[0],
    provider: input.provider || existing?.provider || "gmail-compose-mvp",
    google_sub: input.googleSub || existing?.google_sub || "",
    picture_url: input.pictureUrl || existing?.picture_url || "",
    email_verified: input.emailVerified === true || Boolean(existing?.email_verified),
    credits_remaining: existing?.credits_remaining ?? input.creditsRemaining ?? STARTING_CREDITS,
    profile_json: existing?.profile_json || input.profileSnapshot || null,
    created_at: existing?.created_at || now,
    updated_at: now,
    last_seen_at: now
  };
}

function mapEmail(row, user = null) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    userEmail: user?.gmail_email || row.gmail_email || "",
    userName: user?.name || row.user_name || "",
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

function toEmailRow(entry, userId) {
  const now = new Date().toISOString();
  return {
    id: entry.id || nanoid(),
    user_id: userId,
    status: entry.status || "generated",
    athlete_name: entry.athleteName || "",
    school_id: entry.school?.id || "",
    school_name: entry.school?.name || "",
    school_division: entry.school?.division || "",
    school_conference: entry.school?.conference || "",
    coach_id: entry.coach?.id || "",
    coach_name: entry.coach?.name || "",
    coach_title: entry.coach?.title || "",
    coach_email: entry.coach?.email || null,
    coach_x_handle: entry.coach?.xHandle || "",
    coach_x_url: entry.coach?.xUrl || "",
    email_subject: entry.email_subject || "",
    email_body: entry.email_body || "",
    email_lookup_tip: entry.email_lookup_tip || "",
    provider: entry.provider || "",
    profile_json: entry.profileSnapshot || null,
    generated_at: entry.generatedAt || now,
    opened_at: entry.openedAt || null,
    sent_at: entry.sentAt || null,
    created_at: entry.createdAt || now,
    updated_at: entry.updatedAt || now
  };
}

async function supabaseRequest(table, { method = "GET", query = {}, body, prefer, extraHeaders = {} } = {}) {
  if (!USE_SUPABASE) throw new Error("Supabase is not configured.");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extraHeaders
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase ${table} request failed: ${response.status}`);
  }
  return data;
}

async function supabaseSelectAll(table, query = {}) {
  const rows = [];
  for (let offset = 0; ; offset += SUPABASE_PAGE_SIZE) {
    const page = await supabaseRequest(table, {
      query: {
        ...query,
        limit: SUPABASE_PAGE_SIZE,
        offset
      }
    });
    rows.push(...(page || []));
    if (!page || page.length < SUPABASE_PAGE_SIZE) break;
  }
  return rows;
}

async function supabaseGetUserRowByEmail(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return null;
  const rows = await supabaseRequest("users", {
    query: { select: "*", gmail_email: `eq.${email}`, limit: 1 }
  });
  return rows?.[0] || null;
}

export function dataStoreStatus() {
  return {
    provider: USE_SUPABASE ? "supabase" : "local-json-memory",
    supabaseConfigured: USE_SUPABASE
  };
}

export async function getSchools() {
  if (USE_SUPABASE) {
    const rows = await supabaseSelectAll("schools", { select: "*", order: "name.asc" });
    return rows.map(mapSchool);
  }
  return (await readJson(paths.schools, [])).map(mapSchool);
}

export async function getCoaches() {
  if (USE_SUPABASE) {
    const rows = await supabaseSelectAll("coaches", { select: "*", order: "school_id.asc,name.asc" });
    return rows.map(mapCoach);
  }
  return (await readJson(paths.coaches, [])).map(mapCoach);
}

export async function getUsers() {
  if (USE_SUPABASE) {
    const rows = await supabaseSelectAll("users", { select: "*", order: "created_at.desc" });
    return rows.map(mapUser);
  }
  return [...memoryUsers.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(mapUser);
}

export async function getUserByEmail(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return null;
  if (USE_SUPABASE) return mapUser(await supabaseGetUserRowByEmail(email));
  return mapUser(memoryUsers.get(email));
}

export async function upsertUser(input = {}) {
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");

  if (USE_SUPABASE) {
    const existing = await supabaseGetUserRowByEmail(email);
    const row = userRowFromInput({ ...input, email }, existing);
    const rows = await supabaseRequest("users", {
      method: "POST",
      query: { on_conflict: "gmail_email" },
      prefer: "resolution=merge-duplicates,return=representation",
      body: row
    });
    return mapUser(rows?.[0]);
  }

  const existing = memoryUsers.get(email);
  const row = userRowFromInput({ ...input, email }, existing);
  memoryUsers.set(email, row);
  return mapUser(row);
}

export async function updateUserProfile(userEmail, profileSnapshot = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid user email is required.");
  const now = new Date().toISOString();

  if (USE_SUPABASE) {
    let user = await supabaseGetUserRowByEmail(email);
    if (!user) return upsertUser({ email, profileSnapshot, provider: "gmail-compose-mvp" });
    const rows = await supabaseRequest("users", {
      method: "PATCH",
      query: { gmail_email: `eq.${email}` },
      prefer: "return=representation",
      body: { profile_json: profileSnapshot || {}, updated_at: now, last_seen_at: now }
    });
    return mapUser(rows?.[0]);
  }

  let user = memoryUsers.get(email);
  if (!user) return upsertUser({ email, profileSnapshot, provider: "gmail-compose-mvp" });
  user = { ...user, profile_json: profileSnapshot || {}, updated_at: now, last_seen_at: now };
  memoryUsers.set(email, user);
  return mapUser(user);
}

export async function debitUserCredits(userEmail, amount = 1) {
  const email = String(userEmail || "").trim().toLowerCase();
  const debitAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!email || !email.includes("@")) throw new Error("A valid user email is required.");
  if (debitAmount === 0) return getUserByEmail(email);

  function notEnoughCredits(currentCredits) {
    const err = new Error(`Not enough credits. You have ${currentCredits} credit${currentCredits === 1 ? "" : "s"} remaining, but this needs ${debitAmount}.`);
    err.statusCode = 402;
    return err;
  }

  if (USE_SUPABASE) {
    const user = await supabaseGetUserRowByEmail(email);
    if (!user) return null;
    const currentCredits = Number.isFinite(Number(user.credits_remaining)) ? Number(user.credits_remaining) : STARTING_CREDITS;
    if (currentCredits < debitAmount) throw notEnoughCredits(currentCredits);
    const rows = await supabaseRequest("users", {
      method: "PATCH",
      query: { gmail_email: `eq.${email}` },
      prefer: "return=representation",
      body: {
        credits_remaining: currentCredits - debitAmount,
        last_seen_at: new Date().toISOString()
      }
    });
    return mapUser(rows?.[0]);
  }

  const user = memoryUsers.get(email);
  if (!user) return null;
  const currentCredits = Number.isFinite(Number(user.credits_remaining)) ? Number(user.credits_remaining) : STARTING_CREDITS;
  if (currentCredits < debitAmount) throw notEnoughCredits(currentCredits);
  const updated = {
    ...user,
    credits_remaining: currentCredits - debitAmount,
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  };
  memoryUsers.set(email, updated);
  return mapUser(updated);
}

export async function getEmailHistory() {
  if (USE_SUPABASE) {
    const [users, emails] = await Promise.all([
      supabaseSelectAll("users", { select: "*" }),
      supabaseSelectAll("emails", { select: "*", order: "created_at.desc" })
    ]);
    const usersById = new Map(users.map(user => [user.id, user]));
    return emails.map(email => mapEmail(email, usersById.get(email.user_id)));
  }
  const usersById = new Map([...memoryUsers.values()].map(user => [user.id, user]));
  return [...memoryEmails]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(email => mapEmail(email, usersById.get(email.user_id)));
}

export async function saveEmailHistoryEntries(entries = []) {
  const inserted = [];

  if (USE_SUPABASE) {
    const rowsByUser = new Map();
    for (const entry of entries) {
      const user = await upsertUser({
        email: entry.userEmail,
        name: entry.userName,
        profileSnapshot: entry.profileSnapshot,
        provider: "gmail-compose-mvp"
      });
      const userRow = {
        id: user.id,
        gmail_email: user.email,
        name: user.name
      };
      rowsByUser.set(user.id, userRow);
      const rows = await supabaseRequest("emails", {
        method: "POST",
        prefer: "return=representation",
        body: toEmailRow(entry, user.id)
      });
      inserted.push(mapEmail(rows?.[0], userRow));
    }
    return inserted;
  }

  for (const entry of entries) {
    const user = await upsertUser({
      email: entry.userEmail,
      name: entry.userName,
      profileSnapshot: entry.profileSnapshot,
      provider: "gmail-compose-mvp"
    });
    const userRow = memoryUsers.get(user.email);
    const row = toEmailRow(entry, user.id);
    memoryEmails.push(row);
    inserted.push(mapEmail(row, userRow));
  }
  return inserted;
}

export async function listEmailHistory(userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return [];

  if (USE_SUPABASE) {
    const user = await supabaseGetUserRowByEmail(email);
    if (!user) return [];
    const rows = await supabaseSelectAll("emails", {
      select: "*",
      user_id: `eq.${user.id}`,
      order: "created_at.desc"
    });
    return rows.map(row => mapEmail(row, user));
  }

  const user = memoryUsers.get(email);
  if (!user) return [];
  return memoryEmails
    .filter(row => row.user_id === user.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(row => mapEmail(row, user));
}

export async function updateEmailHistoryItem(id, userEmail, updates = {}) {
  const email = String(userEmail || "").trim().toLowerCase();
  const now = new Date().toISOString();

  if (USE_SUPABASE) {
    const user = await supabaseGetUserRowByEmail(email);
    if (!user) return null;
    const body = {
      updated_at: now
    };
    if (updates.status) body.status = updates.status;
    if (typeof updates.email_subject === "string") body.email_subject = updates.email_subject;
    if (typeof updates.email_body === "string") body.email_body = updates.email_body;
    if (updates.openedAt) body.opened_at = updates.openedAt;
    if (updates.sentAt) body.sent_at = updates.sentAt;

    const rows = await supabaseRequest("emails", {
      method: "PATCH",
      query: { id: `eq.${id}`, user_id: `eq.${user.id}` },
      prefer: "return=representation",
      body
    });
    return rows?.[0] ? mapEmail(rows[0], user) : null;
  }

  const user = memoryUsers.get(email);
  if (!user) return null;
  const index = memoryEmails.findIndex(row => row.id === id && row.user_id === user.id);
  if (index === -1) return null;
  memoryEmails[index] = {
    ...memoryEmails[index],
    status: updates.status || memoryEmails[index].status,
    email_subject: typeof updates.email_subject === "string" ? updates.email_subject : memoryEmails[index].email_subject,
    email_body: typeof updates.email_body === "string" ? updates.email_body : memoryEmails[index].email_body,
    opened_at: updates.openedAt || memoryEmails[index].opened_at,
    sent_at: updates.sentAt || memoryEmails[index].sent_at,
    updated_at: now
  };
  return mapEmail(memoryEmails[index], user);
}

export async function deleteEmailHistoryItem(id, userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();

  if (USE_SUPABASE) {
    const user = await supabaseGetUserRowByEmail(email);
    if (!user) return false;
    const rows = await supabaseRequest("emails", {
      method: "DELETE",
      query: { id: `eq.${id}`, user_id: `eq.${user.id}` },
      prefer: "return=representation"
    });
    return Array.isArray(rows) && rows.length > 0;
  }

  const user = memoryUsers.get(email);
  if (!user) return false;
  const index = memoryEmails.findIndex(row => row.id === id && row.user_id === user.id);
  if (index === -1) return false;
  memoryEmails.splice(index, 1);
  return true;
}

export async function findSchoolByName(name) {
  const schools = await getSchools();
  const needle = normalizeName(name);
  return schools.find(s => normalizeName(s.name) === needle || normalizeName(s.shortName) === needle) || null;
}

export async function searchSchools(q = "", options = {}) {
  const schools = await getSchools();
  const needle = normalizeName(q);
  const limit = Number(options.limit || 250);
  const includePrivate = options.includePrivate === true;
  const filtered = schools.filter(s => {
    if (!needle) return true;
    const blob = [s.name, s.shortName, s.division, s.conference, s.state, s.city].join(" ");
    return normalizeName(blob).includes(needle);
  });
  return filtered
    .slice(0, Math.max(1, Math.min(limit, 1000)))
    .map(school => includePrivate ? school : publicSchool(school));
}

export async function addSchool(input) {
  const existing = await findSchoolByName(input.name);
  if (existing) return existing;
  const record = {
    id: input.id || nanoid(),
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

  if (USE_SUPABASE) {
    const rows = await supabaseRequest("schools", {
      method: "POST",
      prefer: "return=representation",
      body: toSchoolRow(record)
    });
    return mapSchool(rows?.[0]);
  }

  const schools = await getSchools();
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
    const cleaned = cleanCoach(raw);
    const key = `${cleaned.schoolId}|${normalizeName(cleaned.name)}|${normalizeName(cleaned.title)}`;
    const existing = byKey.get(key);

    if (existing) {
      const next = { ...existing, ...cleaned, updatedAt: new Date().toISOString() };
      if (USE_SUPABASE) {
        await supabaseRequest("coaches", {
          method: "PATCH",
          query: { id: `eq.${existing.id}` },
          prefer: "return=representation",
          body: toCoachRow(next)
        });
      } else {
        Object.assign(existing, next);
      }
      updated++;
    } else {
      const record = {
        id: raw.id || nanoid(),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...cleaned
      };
      if (USE_SUPABASE) {
        await supabaseRequest("coaches", {
          method: "POST",
          prefer: "return=representation",
          body: { ...toCoachRow(record), created_at: record.createdAt }
        });
      } else {
        coaches.push(record);
      }
      byKey.set(key, record);
      inserted++;
    }
  }

  if (!USE_SUPABASE) await writeJson(paths.coaches, coaches);
  const total = USE_SUPABASE ? (await getCoaches()).length : coaches.length;
  return { inserted, updated, total };
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
  if (USE_SUPABASE) {
    const rows = await supabaseSelectAll("coaches", {
      select: "*",
      school_id: `eq.${schoolId}`,
      active: "eq.true",
      order: "name.asc"
    });
    return rows.map(mapCoach);
  }
  const coaches = await getCoaches();
  return coaches.filter(c => c.schoolId === schoolId && c.active !== false);
}

export { normalizeName, paths };
