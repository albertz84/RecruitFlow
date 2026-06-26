import crypto from "node:crypto";
import { config } from "./config.js";
import { deleteXAccount, getXAccount, upsertXAccount } from "./database.js";

const X_API = "https://api.x.com";
const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = `${X_API}/2/oauth2/token`;
const X_SCOPES = ["tweet.read", "users.read", "dm.read", "dm.write", "offline.access"];

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function encryptionKey() {
  return crypto.createHash("sha256").update(String(config.xTokenEncryptionSecret || config.sessionSecret)).digest();
}

export function xAuthConfigured() {
  return Boolean(config.xClientId && config.xRedirectUri);
}

export function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  return {
    verifier,
    challenge: base64url(sha256(verifier))
  };
}

export function createXAuthUrl({ state, codeChallenge }) {
  const url = new URL(X_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.xClientId);
  url.searchParams.set("redirect_uri", config.xRedirectUri);
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function encrypt(value = "") {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

function decrypt(value = "") {
  if (!value) return "";
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

async function tokenRequest(body) {
  const params = new URLSearchParams(body);
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (config.xClientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString("base64")}`;
  }
  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: params.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || `X token request failed: ${response.status}`);
  }
  return data;
}

export async function exchangeXCode({ code, codeVerifier }) {
  return tokenRequest({
    code,
    grant_type: "authorization_code",
    client_id: config.xClientId,
    redirect_uri: config.xRedirectUri,
    code_verifier: codeVerifier
  });
}

async function refreshXToken(account) {
  if (!account?.refreshTokenEnc) throw new Error("Reconnect X to refresh DM permissions.");
  const token = await tokenRequest({
    refresh_token: decrypt(account.refreshTokenEnc),
    grant_type: "refresh_token",
    client_id: config.xClientId
  });
  return token;
}

function expiresAtFromToken(token = {}) {
  if (!token.expires_in) return null;
  return new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
}

async function xFetch(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${X_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail || data?.title || data?.errors?.[0]?.message || data?.error || `X API request failed: ${response.status}`;
    const err = new Error(detail);
    err.statusCode = response.status;
    err.rateLimitReset = response.headers.get("x-rate-limit-reset") || "";
    throw err;
  }
  return data;
}

export async function storeXAccountFromToken(userEmail, token) {
  const me = await xFetch("/2/users/me?user.fields=username,name", {
    token: token.access_token
  });
  const user = me?.data;
  if (!user?.id || !user?.username) throw new Error("X did not return the connected account.");
  return upsertXAccount(userEmail, {
    xUserId: user.id,
    username: user.username,
    displayName: user.name || user.username,
    accessTokenEnc: encrypt(token.access_token),
    refreshTokenEnc: encrypt(token.refresh_token || ""),
    expiresAt: expiresAtFromToken(token),
    scopes: String(token.scope || "").split(/\s+/).filter(Boolean)
  });
}

export async function getUsableXToken(userEmail) {
  const account = await getXAccount(userEmail, { includeTokens: true });
  if (!account) throw new Error("Connect X before sending DMs.");
  const expiresAt = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshXToken(account);
    await upsertXAccount(userEmail, {
      ...account,
      accessTokenEnc: encrypt(refreshed.access_token),
      refreshTokenEnc: encrypt(refreshed.refresh_token || decrypt(account.refreshTokenEnc)),
      expiresAt: expiresAtFromToken(refreshed),
      scopes: String(refreshed.scope || account.scopes?.join(" ") || "").split(/\s+/).filter(Boolean)
    });
    return refreshed.access_token;
  }
  return decrypt(account.accessTokenEnc);
}

export async function getPublicXAccount(userEmail) {
  return getXAccount(userEmail);
}

export async function disconnectXAccount(userEmail) {
  return deleteXAccount(userEmail);
}

export async function lookupXUserByHandle({ userEmail, handle }) {
  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  if (!cleanHandle) throw new Error("Coach X handle is missing.");
  const token = await getUsableXToken(userEmail);
  const data = await xFetch(`/2/users/by/username/${encodeURIComponent(cleanHandle)}?user.fields=username,name`, { token });
  const user = data?.data;
  if (!user?.id) throw new Error(`Could not find X user @${cleanHandle}.`);
  return {
    xUserId: user.id,
    username: user.username || cleanHandle,
    displayName: user.name || user.username || cleanHandle
  };
}

export async function sendXDirectMessage({ userEmail, participantId, text }) {
  const token = await getUsableXToken(userEmail);
  const trimmed = String(text || "").trim();
  if (!participantId) throw new Error("X participant id is required.");
  if (!trimmed) throw new Error("DM text is required.");
  const data = await xFetch(`/2/dm_conversations/with/${encodeURIComponent(participantId)}/messages`, {
    method: "POST",
    token,
    body: { text: trimmed }
  });
  return {
    dmConversationId: data?.data?.dm_conversation_id || "",
    dmEventId: data?.data?.dm_event_id || ""
  };
}
