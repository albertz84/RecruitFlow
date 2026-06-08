import express from "express";
import cors from "cors";
import { config, resolvedDraftProvider } from "./config.js";
import {
  searchSchools,
  findSchoolByName,
  addSchool,
  coachesForSchool,
  saveDraft,
  getCoaches,
  getSchools
} from "./database.js";
import { recommendContacts, contactPlanSummary } from "./contactRules.js";
import { generateDraftsForSchool, enrichSchoolWithWebSearch, rewriteDraft } from "./anthropicClient.js";
import { importCoachCsv } from "./csvImport.js";

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));

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
    researchModel: config.anthropicResearchModel,
    draftProvider,
    allowWebResearchDefault: config.allowWebResearchDefault
  });
});

app.get("/api/schools", async (req, res, next) => {
  try {
    const q = req.query.q || "";
    res.json({ schools: await searchSchools(q) });
  } catch (err) { next(err); }
});

app.get("/api/coaches", async (req, res, next) => {
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

app.post("/api/schools", async (req, res, next) => {
  try {
    const school = await addSchool(req.body || {});
    res.status(201).json({ school });
  } catch (err) { next(err); }
});

app.post("/api/admin/import-coaches", async (req, res, next) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body?.csvText;
    if (!csvText) return res.status(400).json({ error: "Send CSV text as text/csv or { csvText } JSON." });
    const result = await importCoachCsv(csvText);
    res.json(result);
  } catch (err) { next(err); }
});

app.post("/api/enrich-school", async (req, res, next) => {
  try {
    const { schoolName, division } = req.body || {};
    if (!schoolName) return res.status(400).json({ error: "schoolName is required" });
    const result = await enrichSchoolWithWebSearch({ schoolName, division });
    res.json(result);
  } catch (err) { next(err); }
});

app.post("/api/generate", async (req, res, next) => {
  try {
    const { profile, schools, options = {} } = req.body || {};
    if (!profile) return res.status(400).json({ error: "profile is required" });
    if (!Array.isArray(schools) || schools.length === 0) return res.status(400).json({ error: "schools must be a non-empty array" });

    const allowWebResearch = Boolean(options.allowWebResearch ?? config.allowWebResearchDefault);
    const maxContacts = Number(options.maxContacts || config.maxContactsPerSchool || 3);
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
      let webResearch = null;

      let coaches = await coachesForSchool(school.id);
      if (coaches.length === 0 && allowWebResearch && !webResearch) {
        webResearch = await enrichSchoolWithWebSearch({ schoolName: school.name, division: school.division });
        coaches = await coachesForSchool(school.id);
      }

      const contacts = recommendContacts({ profile, school, coaches, maxContacts });
      const contactPlan = contactPlanSummary(profile, contacts);
      const draftPack = await generateDraftsForSchool({
        profile,
        school,
        contacts,
        programSummary: school.programSummary,
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
          usedWebResearch: Boolean(webResearch),
          provider: draftPack.provider,
          draftCached: false
        },
        lookupTips: {
          staffPageUrl: school.staffPageUrl || "",
          questionnaireUrl: school.questionnaireUrl || "",
          sourceUrl: school.sourceUrl || ""
        }
      };
      await saveDraft({ profileSnapshot: profile, schoolId: school.id, record });
      results.push(record);
    }

    res.json({ results });
  } catch (err) { next(err); }
});


app.post("/api/rewrite-draft", async (req, res, next) => {
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

app.listen(config.port, config.host, () => {
  console.log(`RecruitFlow server running on http://${config.host}:${config.port}`);
});
