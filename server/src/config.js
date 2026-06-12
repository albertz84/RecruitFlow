import dotenv from "dotenv";

dotenv.config();

const requestedDraftProvider = String(process.env.DRAFT_PROVIDER || "auto").toLowerCase();

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicDraftModel: process.env.ANTHROPIC_DRAFT_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",

  // Draft writing is intentionally decoupled from research. Use a cheap/free
  // model here, or leave keys empty to use the local template fallback.
  draftProvider: requestedDraftProvider,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiDraftModel: process.env.GEMINI_DRAFT_MODEL || "gemini-2.5-flash-lite",

  maxContactsPerSchool: Number(process.env.MAX_CONTACTS_PER_SCHOOL || 3)
};

export function resolvedDraftProvider() {
  if (config.draftProvider === "gemini") return "gemini";
  if (config.draftProvider === "anthropic") return "anthropic";
  if (config.draftProvider === "local" || config.draftProvider === "local-template") return "local-template";
  if (config.geminiApiKey) return "gemini";
  if (config.anthropicApiKey) return "anthropic";
  return "local-template";
}
