import crypto from "node:crypto";
import { config } from "./config.js";
import { getSessionUser, requireAuth } from "./auth.js";
import { createPkce, createXAuthUrl, exchangeXCode, storeXAccountFromToken, xAuthConfigured } from "./xClient.js";

const X_STATE_COOKIE = "rf_x_oauth_state";
const X_STATE_TTL_MS = 1000 * 60 * 10;

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
  if (!value || !signature || sign(value) !== signature) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (decoded.exp && decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      acc[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return acc;
    }, {});
}

function isProductionRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https" || config.clientOrigin.startsWith("https://");
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
  url.searchParams.set("x", status);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  res.redirect(url.toString());
}

export function registerXAuthRoutes(app) {
  app.get("/api/auth/x", requireAuth, (req, res, next) => {
    try {
      if (!xAuthConfigured()) return res.status(500).json({ error: "X login is not configured on the server." });
      const state = crypto.randomBytes(24).toString("base64url");
      const pkce = createPkce();
      setCookie(res, req, X_STATE_COOKIE, encodeSignedJson({
        state,
        verifier: pkce.verifier,
        email: req.authUser.email,
        exp: Date.now() + X_STATE_TTL_MS
      }), { maxAge: X_STATE_TTL_MS });
      res.redirect(createXAuthUrl({ state, codeChallenge: pkce.challenge }));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/x/callback", async (req, res, next) => {
    try {
      if (!xAuthConfigured()) return redirectToClient(res, "error", { message: "X login is not configured." });
      const savedState = decodeSignedJson(parseCookies(req.headers.cookie || "")[X_STATE_COOKIE]);
      clearCookie(res, req, X_STATE_COOKIE);
      if (!savedState?.state || savedState.state !== req.query.state) {
        return redirectToClient(res, "error", { message: "Invalid X sign-in state." });
      }
      const sessionUser = getSessionUser(req);
      if (!sessionUser?.email || sessionUser.email !== savedState.email) {
        return redirectToClient(res, "error", { message: "Sign in with Google before connecting X." });
      }
      if (!req.query.code) return redirectToClient(res, "error", { message: "Missing X authorization code." });
      const token = await exchangeXCode({
        code: String(req.query.code),
        codeVerifier: savedState.verifier
      });
      await storeXAccountFromToken(sessionUser.email, token);
      return redirectToClient(res, "success");
    } catch (err) {
      return redirectToClient(res, "error", { message: err.message || "X sign-in failed." });
    }
  });
}
