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
  getEmailHistoryItemsByIds,
  debitUserCredits,
  getUserByEmail,
  upsertUser,
  updateUserProfile,
  dataStoreStatus,
  getCoaches,
  getSchools,
  listDmHistory,
  saveDmHistoryEntries,
  getDmHistoryItem,
  updateDmHistoryItem,
  deleteDmHistoryItem,
  recentSentDmForCoach
} from "./database.js";
import { recommendContacts, contactPlanSummary } from "./contactRules.js";
import { generateDraftsForSchool, rewriteDraft, generateDmDraft } from "./anthropicClient.js";
import { importCoachCsv } from "./csvImport.js";
import { registerAuthRoutes, requireAdmin, requireAuth } from "./auth.js";
import { registerXAuthRoutes } from "./xAuth.js";
import { disconnectXAccount, getPublicXAccount, lookupXUserByHandle, sendXDirectMessage, xAuthConfigured } from "./xClient.js";
import { handleStripeWebhook, registerBillingRoutes } from "./billing.js";

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
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));
registerAuthRoutes(app);
registerXAuthRoutes(app);
registerBillingRoutes(app);

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
    geminiFallbackModels: config.geminiFallbackModels,
    draftProvider,
    xAuthConfigured: xAuthConfigured(),
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

app.get("/api/x/me", requireAuth, async (req, res, next) => {
  try {
    res.json({
      configured: xAuthConfigured(),
      account: await getPublicXAccount(req.authUser.email)
    });
  } catch (err) { next(err); }
});

app.post("/api/x/disconnect", requireAuth, async (req, res, next) => {
  try {
    await disconnectXAccount(req.authUser.email);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get("/api/dm-history", requireAuth, async (req, res, next) => {
  try {
    res.json({ history: await listDmHistory(req.authUser.email) });
  } catch (err) { next(err); }
});

app.patch("/api/dm-history/:id", requireAuth, async (req, res, next) => {
  try {
    const { status, dmBody } = req.body || {};
    const item = await updateDmHistoryItem(req.params.id, req.authUser.email, {
      status,
      dmBody
    });
    if (!item) return res.status(404).json({ error: "DM history item not found." });
    res.json({ item });
  } catch (err) { next(err); }
});

app.delete("/api/dm-history/:id", requireAuth, async (req, res, next) => {
  try {
    const deleted = await deleteDmHistoryItem(req.params.id, req.authUser.email);
    if (!deleted) return res.status(404).json({ error: "DM history item not found." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function dmContactFromDraft(item) {
  return {
    id: item.coach?.id || "",
    name: item.coach?.name || "Coach",
    title: item.coach?.title || "Football Staff",
    xHandle: item.coach?.xHandle || "",
    xUrl: item.coach?.xUrl || ""
  };
}

function contactWithX(contact) {
  return contact?.xHandle || contact?.xUserId;
}

async function saveGeneratedDms({ userEmail, userName, profile, records }) {
  if (!records.length) return { history: [], creditsRemaining: null };
  const currentUser = await getUserByEmail(userEmail);
  const currentCredits = Number(currentUser?.creditsRemaining ?? 15);
  const neededCredits = Math.round(records.length * 0.5 * 100) / 100;
  if (currentCredits < neededCredits) {
    return {
      error: `Not enough credits. You have ${currentCredits} credit${currentCredits === 1 ? "" : "s"} remaining, but this needs ${neededCredits}.`,
      statusCode: 402
    };
  }
  const history = await saveDmHistoryEntries(records.map(record => ({
    userEmail,
    userName,
    profileSnapshot: profile,
    ...record
  })));
  const updatedUser = await debitUserCredits(userEmail, neededCredits);
  return { history, creditsRemaining: updatedUser?.creditsRemaining ?? currentCredits - neededCredits };
}

app.post("/api/dm-drafts", requireAuth, async (req, res, next) => {
  try {
    const { profile, schools, options = {} } = req.body || {};
    if (!profile) return res.status(400).json({ error: "profile is required" });
    if (!Array.isArray(schools) || schools.length === 0) return res.status(400).json({ error: "schools must be a non-empty array" });

    const requestedMaxContacts = Number(options.maxContacts);
    const maxContacts = Number.isFinite(requestedMaxContacts)
      ? Math.min(Math.max(requestedMaxContacts, 1), 4)
      : Number(config.maxContactsPerSchool || 3);
    const records = [];
    const skipped = [];

    for (const requested of schools) {
      const requestedName = typeof requested === "string" ? requested : requested.name;
      const school = await findSchoolByName(requestedName);
      if (!school) {
        skipped.push({ school: requestedName, reason: "School is not in the database." });
        continue;
      }
      const coaches = await coachesForSchool(school.id);
      const contacts = recommendContacts({ profile, school, coaches, maxContacts }).filter(contactWithX);
      if (!contacts.length) {
        skipped.push({ school: school.name, reason: "No selected coach has an X handle." });
        continue;
      }
      for (const contact of contacts) {
        const draft = await generateDmDraft({ profile, school, contact, mode: "coach_dm" });
        records.push({
          mode: "coach_dm",
          athleteName: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(),
          school: { id: school.id, name: school.name, division: school.division || "", conference: school.conference || "" },
          coach: {
            id: contact.id || "",
            name: contact.name || "",
            title: contact.title || "",
            xHandle: contact.xHandle || "",
            xUrl: contact.xUrl || ""
          },
          dmBody: draft.dmBody,
          provider: draft.provider,
          generatedAt: new Date().toISOString()
        });
      }
    }

    const saved = await saveGeneratedDms({
      userEmail: req.authUser.email,
      userName: req.authUser.name || "",
      profile,
      records
    });
    if (saved.error) return res.status(saved.statusCode || 400).json({ error: saved.error });
    res.json({ history: saved.history, skipped, creditsRemaining: saved.creditsRemaining });
  } catch (err) { next(err); }
});

app.post("/api/dm-followups", requireAuth, async (req, res, next) => {
  try {
    const { emailIds = [] } = req.body || {};
    const emailItems = await getEmailHistoryItemsByIds(emailIds, req.authUser.email);
    const records = [];
    const skipped = [];

    for (const email of emailItems) {
      if (!email.coach?.xHandle) {
        skipped.push({ emailId: email.id, reason: "The coach does not have an X handle saved." });
        continue;
      }
      const draft = await generateDmDraft({
        profile: email.profileSnapshot || {},
        school: email.school || {},
        contact: {
          id: email.coach.id,
          name: email.coach.name,
          title: email.coach.title,
          xHandle: email.coach.xHandle,
          xUrl: email.coach.xUrl
        },
        email,
        mode: "email_follow_up"
      });
      records.push({
        emailHistoryId: email.id,
        mode: "email_follow_up",
        athleteName: email.athleteName || "",
        school: email.school,
        coach: {
          id: email.coach.id || "",
          name: email.coach.name || "",
          title: email.coach.title || "",
          xHandle: email.coach.xHandle || "",
          xUrl: email.coach.xUrl || ""
        },
        dmBody: draft.dmBody,
        provider: draft.provider,
        profileSnapshot: email.profileSnapshot || {},
        generatedAt: new Date().toISOString()
      });
    }

    const saved = await saveGeneratedDms({
      userEmail: req.authUser.email,
      userName: req.authUser.name || "",
      profile: {},
      records
    });
    if (saved.error) return res.status(saved.statusCode || 400).json({ error: saved.error });
    res.json({ history: saved.history, skipped, creditsRemaining: saved.creditsRemaining });
  } catch (err) { next(err); }
});

async function sendDmHistoryItem(item, userEmail) {
  if (!item) return { ok: false, error: "DM history item not found." };
  if (item.status === "sent") return { ok: true, item };
  const recent = await recentSentDmForCoach(userEmail, item.coach?.id, item.coach?.xHandle, 7);
  if (recent && recent.id !== item.id) {
    const updated = await updateDmHistoryItem(item.id, userEmail, {
      status: "blocked",
      failedAt: new Date().toISOString(),
      failureReason: "A DM was already sent to this coach in the last 7 days."
    });
    return { ok: false, item: updated, error: "A DM was already sent to this coach in the last 7 days." };
  }
  try {
    const xUser = item.coach?.xUserId
      ? { xUserId: item.coach.xUserId }
      : await lookupXUserByHandle({ userEmail, handle: item.coach?.xHandle });
    const sent = await sendXDirectMessage({
      userEmail,
      participantId: xUser.xUserId,
      text: item.dmBody
    });
    const updated = await updateDmHistoryItem(item.id, userEmail, {
      status: "sent",
      sentAt: new Date().toISOString(),
      coachXUserId: xUser.xUserId,
      xDmEventId: sent.dmEventId,
      xDmConversationId: sent.dmConversationId,
      failureReason: ""
    });
    return { ok: true, item: updated };
  } catch (err) {
    const status = err.statusCode === 429 ? "rate_limited" : err.statusCode === 403 ? "blocked" : "failed";
    const updated = await updateDmHistoryItem(item.id, userEmail, {
      status,
      failedAt: new Date().toISOString(),
      failureReason: err.message || "X DM send failed."
    });
    return { ok: false, item: updated, error: err.message || "X DM send failed." };
  }
}

app.post("/api/dm-send", requireAuth, async (req, res, next) => {
  try {
    const item = await getDmHistoryItem(req.body?.id, req.authUser.email);
    const result = await sendDmHistoryItem(item, req.authUser.email);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) { next(err); }
});

app.post("/api/dm-send-batch", requireAuth, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Select at least one DM." });
    if (ids.length > config.xDmBatchLimit) {
      return res.status(400).json({ error: `Send at most ${config.xDmBatchLimit} DMs at a time.` });
    }
    const results = [];
    for (const id of ids) {
      const item = await getDmHistoryItem(id, req.authUser.email);
      results.push({ id, ...(await sendDmHistoryItem(item, req.authUser.email)) });
    }
    res.json({ results, history: await listDmHistory(req.authUser.email) });
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
    const planned = [];
    let plannedDrafts = 0;

    for (const requested of schools) {
      const requestedName = typeof requested === "string" ? requested : requested.name;
      if (!requestedName) return res.status(400).json({ error: "Each selected school must include a name." });
      const school = await findSchoolByName(requestedName);
      if (!school) {
        return res.status(400).json({
          error: `${requestedName} is not in the RecruitFlow school database. Add or import the school before generating emails.`
        });
      }
      const coaches = await coachesForSchool(school.id);
      const contacts = recommendContacts({ profile, school, coaches, maxContacts });
      const contactPlan = contactPlanSummary(profile, contacts);
      plannedDrafts += contacts.length;
      planned.push({ school, coaches, contacts, contactPlan });
    }

    const currentUser = await getUserByEmail(userEmail);
    const currentCredits = Number(currentUser?.creditsRemaining ?? req.authUser.creditsRemaining ?? 15);
    if (plannedDrafts > currentCredits) {
      return res.status(402).json({
        error: `Not enough credits. You have ${currentCredits} credit${currentCredits === 1 ? "" : "s"} remaining, but this needs ${plannedDrafts}.`,
        creditsRemaining: currentCredits
      });
    }

    const results = [];

    for (const { school, coaches, contacts, contactPlan } of planned) {
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

    const actualDrafts = results.reduce((sum, result) => sum + (result.drafts || []).length, 0);
    const updatedUser = actualDrafts > 0 ? await debitUserCredits(userEmail, actualDrafts) : currentUser;

    res.json({ results, creditsRemaining: updatedUser?.creditsRemaining ?? currentCredits });
  } catch (err) { next(err); }
});


app.post("/api/rewrite-draft", requireAuth, async (req, res, next) => {
  try {
    const { profile, school, contact, draft, action } = req.body || {};
    if (!profile) return res.status(400).json({ error: "profile is required" });
    if (!school) return res.status(400).json({ error: "school is required" });
    if (!draft) return res.status(400).json({ error: "draft is required" });
    const currentUser = await getUserByEmail(req.authUser.email);
    const currentCredits = Number(currentUser?.creditsRemaining ?? req.authUser.creditsRemaining ?? 15);
    if (currentCredits < 1) {
      return res.status(402).json({ error: "Not enough credits. You have 0 credits remaining.", creditsRemaining: 0 });
    }
    const result = await rewriteDraft({
      profile,
      school,
      contact: contact || null,
      draft,
      action: action || "shorter"
    });
    const updatedUser = await debitUserCredits(req.authUser.email, 1);
    res.json({ ...result, creditsRemaining: updatedUser?.creditsRemaining ?? currentCredits - 1 });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`RecruitFlow server running on http://${HOST}:${PORT}`);
});
