import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.js";
import { getUserByEmail, upsertUser } from "./database.js";

const SESSION_COOKIE = "rf_session";
const OAUTH_STATE_COOKIE = "rf_oauth_state";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;
const GOOGLE_SCOPES = ["openid", "email", "profile"];

function authConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);
}

function isProductionRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https" || config.clientOrigin.startsWith("https://");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      const key = part.slice(0, index);
      const value = part.slice(index + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function sign(value) {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
}

function encodeSignedJson(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${sign(value)}`;
}

function decodeSignedJson(raw) {
  if (!raw || !raw.includes(".")) return null;
  const [value, signature] = raw.split(".");
  if (!value || !signature) return null;
  const expected = sign(value);
  const safeExpected = Buffer.from(expected);
  const safeSignature = Buffer.from(signature);
  if (safeExpected.length !== safeSignature.length) return null;
  if (!crypto.timingSafeEqual(safeExpected, safeSignature)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (decoded.exp && decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function setCookie(res, req, name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax"
  ];
  if (isProductionRequest(req)) parts.push("Secure");
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  res.append("Set-Cookie", parts.join("; "));
}

function clearCookie(res, req, name) {
  setCookie(res, req, name, "", { maxAge: 0 });
}

function redirectToClient(res, status, params = {}) {
  const url = new URL(config.clientOrigin);
  url.searchParams.set("auth", status);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
}

function getOAuthClient() {
  return new OAuth2Client(config.googleClientId, config.googleClientSecret, config.googleRedirectUri);
}

function isAdminEmail(email = "") {
  return config.adminEmails.includes(String(email).trim().toLowerCase());
}

export function getSessionUser(req) {
  const raw = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  return decodeSignedJson(raw);
}

export async function optionalAuth(req, res, next) {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.email) return next();
    const dbUser = await getUserByEmail(sessionUser.email);
    req.authUser = dbUser
      ? { ...sessionUser, ...dbUser, isAdmin: isAdminEmail(dbUser.email) }
      : { ...sessionUser, isAdmin: isAdminEmail(sessionUser.email) };
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req, res, next) {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser?.email) return res.status(401).json({ error: "Sign in with Google first." });
    const dbUser = await getUserByEmail(sessionUser.email);
    if (!dbUser) return res.status(401).json({ error: "Sign in with Google first." });
    req.authUser = { ...sessionUser, ...dbUser, isAdmin: isAdminEmail(dbUser.email) };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.authUser?.isAdmin) return res.status(403).json({ error: "Admin access is not enabled for this Google account." });
  next();
}

export function registerAuthRoutes(app) {
  app.get("/api/auth/google", (req, res, next) => {
    try {
      if (!authConfigured()) return res.status(500).json({ error: "Google OAuth is not configured on the server." });
      const state = crypto.randomBytes(24).toString("base64url");
      setCookie(res, req, OAUTH_STATE_COOKIE, encodeSignedJson({ state, exp: Date.now() + OAUTH_STATE_TTL_MS }), { maxAge: OAUTH_STATE_TTL_MS });
      const authUrl = getOAuthClient().generateAuthUrl({
        access_type: "online",
        prompt: "select_account",
        scope: GOOGLE_SCOPES,
        state
      });
      res.redirect(authUrl);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/google/callback", async (req, res, next) => {
    try {
      if (!authConfigured()) return redirectToClient(res, "error", { message: "Google OAuth is not configured." });
      const savedState = decodeSignedJson(parseCookies(req.headers.cookie || "")[OAUTH_STATE_COOKIE]);
      clearCookie(res, req, OAUTH_STATE_COOKIE);
      if (!savedState?.state || savedState.state !== req.query.state) {
        return redirectToClient(res, "error", { message: "Invalid Google sign-in state." });
      }
      if (!req.query.code) return redirectToClient(res, "error", { message: "Missing Google sign-in code." });

      const oauthClient = getOAuthClient();
      const { tokens } = await oauthClient.getToken(String(req.query.code));
      if (!tokens.id_token) return redirectToClient(res, "error", { message: "Google did not return an identity token." });
      const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.googleClientId
      });
      const payload = ticket.getPayload();
      if (!payload?.email || payload.email_verified !== true) {
        return redirectToClient(res, "error", { message: "Use a verified Google email account." });
      }

      const user = await upsertUser({
        email: payload.email,
        name: payload.name || payload.email.split("@")[0],
        provider: "google-oauth",
        googleSub: payload.sub,
        pictureUrl: payload.picture || "",
        emailVerified: true
      });

      setCookie(res, req, SESSION_COOKIE, encodeSignedJson({
        id: user.id,
        sub: payload.sub,
        email: user.email,
        name: user.name,
        pictureUrl: user.pictureUrl || payload.picture || "",
        exp: Date.now() + SESSION_TTL_MS
      }), { maxAge: SESSION_TTL_MS });
      redirectToClient(res, "success");
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/me", optionalAuth, (req, res) => {
    res.json({
      configured: authConfigured(),
      user: req.authUser || null
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    clearCookie(res, req, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
