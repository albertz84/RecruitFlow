import express from "express";
import cors from "cors";
import { config, resolvedDraftProvider } from "./config.js";
import {
  searchSchools,
  findSchoolByName,
  addSchool,
  coachesForSchool,
  saveEmailHistoryEntries,
  listEmailHistory,
  updateEmailHistoryItem,
  deleteEmailHistoryItem,
  upsertUser,
  updateUserProfile,
  dataStoreStatus,
  getCoaches,
  getSchools
} from "./database.js";
import { recommendContacts, contactPlanSummary } from "./contactRules.js";
import { generateDraftsForSchool, rewriteDraft } from "./anthropicClient.js";
import { importCoachCsv } from "./csvImport.js";
import { registerAuthRoutes, requireAdmin, requireAuth } from "./auth.js";

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  process.env.CLIENT_ORIGIN ||
  config.clientOrigin ||
  ""
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

function expandOriginVariants(origins) {
  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.slice(4);
        expanded.add(url.origin);
      } else {
        url.hostname = `www.${url.hostname}`;
        expanded.add(url.origin);
      }
    } catch {
      // Ignore malformed origins; the exact value remains in the allowlist.
    }
  }
  return [...expanded];
}

const expandedAllowedOrigins = expandOriginVariants(allowedOrigins);

console.log("Allowed CORS origins:", expandedAllowedOrigins);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (expandedAllowedOrigins.includes(origin)) return callback(null, true);
    console.error("CORS blocked origin:", origin);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

const app = express();
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));
registerAuthRoutes(app);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "recruitflow-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  const draftProvider = resolvedDraftProvider();
  const draftApiKeyConfigured =
    draftProvider === "gemini" ? Boolean(config.geminiApiKey) :
    draftProvider === "anthropic" ? Boolean(config.anthropicApiKey) :
    true;

  res.json({
    ok: true,
    apiKeyConfigured: draftApiKeyConfigured,
    geminiApiKeyConfigured: Boolean(config.geminiApiKey),
    anthropicApiKeyConfigured: Boolean(config.anthropicApiKey),
    geminiDraftModel: config.geminiDraftModel,
    draftProvider,
    dataStore: dataStoreStatus()
  });
});

app.get("/api/schools", requireAuth, async (req, res, next) => {
  try {
    const q = req.query.q || "";
    const limit = Number(req.query.limit || 1000);
    res.json({ schools: await searchSchools(q, { limit }) });
  } catch (err) { next(err); }
});

app.get("/api/coaches", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const schoolId = req.query.schoolId;
    const coaches = schoolId ? await coachesForSchool(schoolId) : await getCoaches();
    res.json({ coaches });
  } catch (err) { next(err); }
});

app.get("/api/stats", async (req, res, next) => {
  try {
    const schools = await getSchools();
    const coaches = await getCoaches();
    const emails = coaches.filter(c => c.email).length;
    res.json({
      schools: schools.length,
      coaches: coaches.length,
      coachesWithEmails: emails,
      emailCoveragePct: coaches.length ? Math.round((emails / coaches.length) * 100) : 0
    });
  } catch (err) { next(err); }
});

app.post("/api/connect-gmail", requireAuth, async (req, res, next) => {
  try {
    const { profileSnapshot } = req.body || {};
    const user = await upsertUser({
      email: req.authUser.email,
      name: req.authUser.name,
      profileSnapshot,
      provider: "google-oauth"
    });
    res.json({ user });
  } catch (err) { next(err); }
});

app.patch("/api/user-profile", requireAuth, async (req, res, next) => {
  try {
    const { profileSnapshot } = req.body || {};
    const user = await updateUserProfile(req.authUser.email, profileSnapshot || {});
    res.json({ user });
  } catch (err) { next(err); }
});

app.get("/api/email-history", requireAuth, async (req, res, next) => {
  try {
    res.json({ history: await listEmailHistory(req.authUser.email) });
  } catch (err) { next(err); }
});

app.patch("/api/email-history/:id", requireAuth, async (req, res, next) => {
  try {
    const { status, email_subject, email_body } = req.body || {};
    const updates = {};
    if (status) {
      if (!["generated", "opened_gmail", "sent"].includes(status)) {
        return res.status(400).json({ error: "Invalid email history status." });
      }
      updates.status = status;
      if (status === "opened_gmail") updates.openedAt = new Date().toISOString();
      if (status === "sent") updates.sentAt = new Date().toISOString();
    }
    if (typeof email_subject === "string") updates.email_subject = email_subject;
    if (typeof email_body === "string") updates.email_body = email_body;
    const item = await updateEmailHistoryItem(req.params.id, req.authUser.email, updates);
    if (!item) return res.status(404).json({ error: "Email history item not found." });
    res.json({ item });
  } catch (err) { next(err); }
});

app.delete("/api/email-history/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await deleteEmailHistoryItem(req.params.id, req.authUser.email);
    if (!deleted) return res.status(404).json({ error: "Email history item not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post("/api/schools", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const school = await addSchool(req.body || {});
    res.status(201).json({ school });
  } catch (err) { next(err); }
});

app.post("/api/admin/import-coaches", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body?.csvText;
    if (!csvText) return res.status(400).json({ error: "Send CSV text as text/csv or { csvText } JSON." });
    const result = await importCoachCsv(csvText);
    res.json(result);
  } catch (err) { next(err); }
});

app.post("/api/generate", requireAuth, async (req, res, next) => {
  try {
    const { profile, schools, options = {} } = req.body || {};
    if (!profile) return res.status(400).json({ error: "profile is required" });
    if (!Array.isArray(schools) || schools.length === 0) return res.status(400).json({ error: "schools must be a non-empty array" });

    const requestedMaxContacts = Number(options.maxContacts);
    const maxContacts = Number.isFinite(requestedMaxContacts)
      ? Math.min(Math.max(requestedMaxContacts, 1), 4)
      : Number(config.maxContactsPerSchool || 3);
    const userEmail = req.authUser.email;
    const resolvedSchools = [];

    for (const requested of schools) {
      const requestedName = typeof requested === "string" ? requested : requested.name;
      if (!requestedName) return res.status(400).json({ error: "Each selected school must include a name." });
      const school = await findSchoolByName(requestedName);
      if (!school) {
        return res.status(400).json({
          error: `${requestedName} is not in the RecruitFlow school database. Add or import the school before generating emails.`
        });
      }
      resolvedSchools.push(school);
    }

    const results = [];

    for (const school of resolvedSchools) {
      let coaches = await coachesForSchool(school.id);

      const contacts = recommendContacts({ profile, school, coaches, maxContacts });
      const contactPlan = contactPlanSummary(profile, contacts);
      const draftPack = await generateDraftsForSchool({
        profile,
        school,
        contacts,
        programSummary: school.programSummary
      });

      const record = {
        school,
        contacts,
        contactPlan,
        programSummary: draftPack.program_summary || school.programSummary || "",
        drafts: draftPack.drafts,
        dataQuality: {
          schoolConfidence: school.dataConfidence || "low",
          contactsInDatabase: coaches.length,
          contactsWithEmails: contacts.filter(c => c.email).length,
          provider: draftPack.provider
        },
        lookupTips: {
          staffPageUrl: school.staffPageUrl || "",
          questionnaireUrl: school.questionnaireUrl || "",
          sourceUrl: school.sourceUrl || ""
        }
      };
      if (userEmail) {
        const athleteName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
        const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
        const historyEntries = await saveEmailHistoryEntries(draftPack.drafts.map(draft => ({
          userEmail,
          userName: req.authUser.name || "",
          athleteName,
          profileSnapshot: profile,
          school: {
            id: school.id,
            name: school.name,
            division: school.division || "",
            conference: school.conference || ""
          },
          coach: {
            id: draft.coach_id || "",
            name: draft.coach_name || "",
            title: draft.coach_title || "",
            email: draft.coach_email || null,
            xHandle: draft.coach_x_handle || contactsById.get(draft.coach_id)?.xHandle || "",
            xUrl: draft.coach_x_url || (contactsById.get(draft.coach_id)?.xHandle ? `https://x.com/${String(contactsById.get(draft.coach_id).xHandle).replace(/^@/, "")}` : "")
          },
          email_subject: draft.email_subject || "",
          email_body: draft.email_body || "",
          email_lookup_tip: draft.email_lookup_tip || "",
          provider: draftPack.provider,
          generatedAt: new Date().toISOString()
        })));
        const byCoachId = new Map(historyEntries.map(item => [item.coach.id, item.id]));
        record.drafts = record.drafts.map((draft, index) => ({
          ...draft,
          historyId: byCoachId.get(draft.coach_id) || historyEntries[index]?.id || null
        }));
      }
      results.push(record);
    }

    res.json({ results });
  } catch (err) { next(err); }
});


app.post("/api/rewrite-draft", requireAuth, async (req, res, next) => {
  try {
    const { profile, school, contact, draft, action } = req.body || {};
    if (!profile) return res.status(400).json({ error: "profile is required" });
    if (!school) return res.status(400).json({ error: "school is required" });
    if (!draft) return res.status(400).json({ error: "draft is required" });
    const result = await rewriteDraft({
      profile,
      school,
      contact: contact || null,
      draft,
      action: action || "shorter"
    });
    res.json(result);
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`RecruitFlow server running on http://${HOST}:${PORT}`);
});
