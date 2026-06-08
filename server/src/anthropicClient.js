import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { config, resolvedDraftProvider } from "./config.js";
import { buildSchoolDraftPrompt, buildEnrichmentPrompt, buildRewritePrompt } from "./prompts.js";
import { buildLocalDraft, buildLocalRewrite } from "./localTemplate.js";
import { contactPlanSummary } from "./contactRules.js";
import { getCache, setCacheValue, upsertCoaches, addSchool } from "./database.js";

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

const draftPackSchema = {
  type: "object",
  properties: {
    program_summary: { type: "string" },
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          coach_id: { type: "string" },
          coach_name: { type: "string" },
          coach_title: { type: "string" },
          coach_email: { type: ["string", "null"] },
          email_lookup_tip: { type: "string" },
          email_subject: { type: "string" },
          email_body: { type: "string" }
        },
        required: ["coach_id", "coach_name", "coach_title", "coach_email", "email_lookup_tip", "email_subject", "email_body"]
      }
    }
  },
  required: ["program_summary", "drafts"]
};

const rewriteSchema = {
  type: "object",
  properties: {
    email_subject: { type: "string" },
    email_body: { type: "string" },
    email_lookup_tip: { type: "string" }
  },
  required: ["email_subject", "email_body", "email_lookup_tip"]
};

function parseJsonText(text) {
  const clean = String(text || "").replace(/```json\s?|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("Model did not return valid JSON");
}

function textFromAnthropicMessage(message) {
  return (message.content || [])
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n")
    .trim();
}

function anthropicClient() {
  if (!config.anthropicApiKey) return null;
  return new Anthropic({ apiKey: config.anthropicApiKey });
}

async function callAnthropicJson({ prompt, system, maxTokens = 2500, temperature = 0.4, model = config.anthropicDraftModel }) {
  const api = anthropicClient();
  if (!api) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const message = await api.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: "user", content: prompt }]
  });
  return { parsed: parseJsonText(textFromAnthropicMessage(message)), usage: message.usage || null };
}

async function callGeminiJson({ prompt, system, maxTokens = 2500, temperature = 0.4, schema = null }) {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const geminiModel = String(config.geminiDraftModel || "gemini-2.5-flash-lite").replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiApiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        ...(schema ? { responseJsonSchema: schema } : {})
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed: ${response.status}`;
    throw new Error(message);
  }
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(part => part.text || "").join("\n").trim();
  if (!text) {
    const reason = candidate?.finishReason ? ` Finish reason: ${candidate.finishReason}.` : "";
    throw new Error(`Gemini returned no JSON draft text.${reason}`);
  }
  return { parsed: parseJsonText(text), usage: data.usageMetadata || null };
}

async function callDraftJson({ prompt, system, maxTokens = 2500, temperature = 0.4, schema = null }) {
  const provider = resolvedDraftProvider();
  if (provider === "gemini") {
    const result = await callGeminiJson({ prompt, system, maxTokens, temperature, schema });
    return { ...result, provider: `gemini:${config.geminiDraftModel}` };
  }
  if (provider === "anthropic") {
    const result = await callAnthropicJson({ prompt, system, maxTokens, temperature, model: config.anthropicDraftModel });
    return { ...result, provider: `anthropic:${config.anthropicDraftModel}` };
  }
  return null;
}

export async function generateDraftsForSchool({ profile, school, contacts, programSummary }) {
  const plan = contactPlanSummary(profile, contacts);

  // Important: drafts are NOT cached. Coach/school research is cached, but the
  // actual email writing step is intentionally fresh because it should be cheap
  // and because users expect regenerate/rewrite to produce a new draft.
  const localOutput = () => ({
    program_summary: programSummary || school.programSummary || "Saved database context was used. Add a program summary for stronger personalization.",
    drafts: contacts.map(coach => buildLocalDraft({ profile, school, coach, programSummary })),
    provider: "local-template",
    draftCached: false
  });

  const provider = resolvedDraftProvider();
  if (provider === "local-template") return localOutput();

  const drafts = [];
  const summaries = [];
  let providerLabel = provider;
  let usage = null;

  for (const contact of contacts) {
    const prompt = buildSchoolDraftPrompt({
      profile,
      school,
      contacts: [contact],
      programSummary,
      contactPlan: `${plan}\n\nWrite only for this contact now: ${contact.name} — ${contact.title || "Football Staff"}.\nAlready generated angles to avoid repeating: ${summaries.join(" | ") || "none"}`
    });
    const result = await callDraftJson({
      prompt,
      maxTokens: 1700,
      temperature: 0.65,
      schema: draftPackSchema,
      system: "You write accurate, realistic college football recruiting outreach. Every email must be individually curated for this exact coach. Return only valid JSON."
    });

    const parsed = result.parsed;
    const draft = Array.isArray(parsed.drafts) ? parsed.drafts[0] : null;
    if (!draft?.email_subject || !draft?.email_body) {
      throw new Error(`AI draft provider did not return a valid draft for ${contact.name || "selected contact"}.`);
    }

    drafts.push({
      coach_id: draft.coach_id || contact.id || null,
      coach_name: draft.coach_name || contact.name || "Coach",
      coach_title: draft.coach_title || contact.title || "Football Staff",
      coach_email: draft.coach_email ?? contact.email ?? null,
      email_lookup_tip: draft.email_lookup_tip || (contact.email ? "" : school.staffPageUrl || school.questionnaireUrl || "Check the school's football staff directory and recruiting questionnaire."),
      email_subject: draft.email_subject,
      email_body: draft.email_body,
      draft_source: `ai:${result.provider}`
    });
    summaries.push(`${contact.title || "contact"}:${draft.email_subject}`);
    providerLabel = result.provider;
    usage = result.usage;
  }

  return {
    program_summary: programSummary || school.programSummary || "Saved database context was used. Add a program summary for stronger personalization.",
    drafts,
    provider: providerLabel,
    usage,
    draftCached: false
  };
}

export async function rewriteDraft({ profile, school, contact, draft, action }) {
  const localOutput = () => ({
    draft: buildLocalRewrite({ profile, school, coach: contact, draft, action }),
    provider: "local-template",
    draftCached: false
  });

  if (resolvedDraftProvider() === "local-template") return localOutput();

  const result = await callDraftJson({
    prompt: buildRewritePrompt({ profile, school, contact, draft, action }),
    maxTokens: action === "dm_version" ? 900 : 1800,
    temperature: 0.55,
    schema: rewriteSchema,
    system: "You rewrite football recruiting outreach. Preserve facts. Return only valid JSON."
  });

  if (!result) return localOutput();
  const parsed = result.parsed;
  return {
    draft: {
      ...draft,
      email_subject: parsed.email_subject || draft.email_subject || "",
      email_body: parsed.email_body || draft.email_body || "",
      coach_id: draft.coach_id || contact?.id || null,
      coach_name: draft.coach_name || contact?.name || "Coach",
      coach_title: draft.coach_title || contact?.title || "Football Staff",
      coach_email: draft.coach_email ?? contact?.email ?? null,
      email_lookup_tip: parsed.email_lookup_tip || draft.email_lookup_tip || "",
      draft_source: `rewrite:${action}`
    },
    provider: result.provider,
    usage: result.usage,
    draftCached: false
  };
}

export async function enrichSchoolWithWebSearch({ schoolName, division }) {
  const cacheKey = `enrich:${hash({ schoolName, division })}`;
  const cache = await getCache();
  if (cache[cacheKey]) return { ...cache[cacheKey].value, cacheHit: true };

  const api = anthropicClient();
  if (!api) {
    return {
      skipped: true,
      reason: "ANTHROPIC_API_KEY is not configured. Add the school and coaches manually or import a CSV.",
      school: null,
      coaches: []
    };
  }

  const message = await api.messages.create({
    model: config.anthropicResearchModel,
    max_tokens: 2200,
    temperature: 0.2,
    system: "You extract current college football staff/contact data. Use web search. Return only JSON. Never invent emails.",
    messages: [{ role: "user", content: buildEnrichmentPrompt({ schoolName, division }) }],
    tools: [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: config.maxWebSearchUsesPerSchool
    }]
  });

  const parsed = parseJsonText(textFromAnthropicMessage(message));
  let school = null;
  if (parsed.school?.name) {
    school = await addSchool(parsed.school);
  }
  const coaches = Array.isArray(parsed.coaches) ? parsed.coaches.map(c => ({ ...c, schoolId: school?.id })) : [];
  if (school && coaches.length) await upsertCoaches(coaches);

  const output = {
    school,
    coaches,
    provider: "anthropic-web-search",
    usage: message.usage || null,
    cacheHit: false
  };
  await setCacheValue(cacheKey, output);
  return output;
}
