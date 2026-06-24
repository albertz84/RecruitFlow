import dotenv from "dotenv";

dotenv.config();

const requestedDraftProvider = String(process.env.DRAFT_PROVIDER || "auto").toLowerCase();

function envList(value = "") {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-me",

  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/auth/google/callback`,
  adminEmails: String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicDraftModel: process.env.ANTHROPIC_DRAFT_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",

  // Draft writing is intentionally decoupled from research. Use a cheap/free
  // model here, or leave keys empty to use the local template fallback.
  draftProvider: requestedDraftProvider,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiDraftModel: process.env.GEMINI_DRAFT_MODEL || "gemini-2.5-flash-lite",
  geminiFallbackModels: envList(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-2.0-flash"),

  maxContactsPerSchool: Number(process.env.MAX_CONTACTS_PER_SCHOOL || 3),

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripeSuccessUrl: process.env.STRIPE_SUCCESS_URL || "",
  stripeCancelUrl: process.env.STRIPE_CANCEL_URL || "",
  stripeCreditPrice30: process.env.STRIPE_PRICE_30_CREDITS || "",
  stripeCreditPrice200: process.env.STRIPE_PRICE_200_CREDITS || ""
};

export function resolvedDraftProvider() {
  if (config.draftProvider === "gemini") return "gemini";
  if (config.draftProvider === "anthropic") return "anthropic";
  if (config.draftProvider === "local" || config.draftProvider === "local-template") return "local-template";
  if (config.geminiApiKey) return "gemini";
  if (config.anthropicApiKey) return "anthropic";
  return "local-template";
}
