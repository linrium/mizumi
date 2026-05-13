const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const sessionTtlSeconds = 60 * 60 * 8;
export const stateTtlSeconds = 60 * 10;

const SESSION_COOKIE_NAME = "mizumi_session";
const STATE_COOKIE_NAME = "mizumi_auth_state";
const DEFAULT_AUTH_SECRET = "mizumi-app-ui-dev-auth-secret";

export type AppSession = {
  realm: string;
  sub?: string;
  email?: string;
  preferredUsername?: string;
  name?: string;
  idToken: string;
  expiresAt: number;
};

type AuthState = {
  realm: string;
  state: string;
  next: string;
  expiresAt: number;
};

type IdTokenClaims = {
  sub?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  exp: number;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? DEFAULT_AUTH_SECRET;
}

export function getAvailableRealms() {
  return (process.env.KEYCLOAK_REALMS ?? "vietjetair,hdbank")
    .split(",")
    .map((realm) => realm.trim())
    .filter(Boolean);
}

export function getDefaultRealm() {
  return getAvailableRealms()[0] ?? "vietjetair";
}

export function getClientId() {
  return process.env.KEYCLOAK_CLIENT_ID ?? "app-ui";
}

export function getClientSecret() {
  return process.env.KEYCLOAK_CLIENT_SECRET ?? "app-ui-secret";
}

export function getPublicBaseUrl() {
  return process.env.KEYCLOAK_PUBLIC_BASE_URL ?? "http://127.0.0.1:8083";
}

export function getInternalBaseUrl() {
  return (
    process.env.KEYCLOAK_INTERNAL_BASE_URL ??
    process.env.KEYCLOAK_PUBLIC_BASE_URL ??
    "http://127.0.0.1:8083"
  );
}

export function isAllowedRealm(realm: string) {
  return getAvailableRealms().includes(realm);
}

export function getPublicRealmBaseUrl(realm: string) {
  return `${getPublicBaseUrl()}/realms/${realm}`;
}

export function getInternalRealmBaseUrl(realm: string) {
  return `${getInternalBaseUrl()}/realms/${realm}`;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeJson(value: unknown) {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string) {
  return JSON.parse(decoder.decode(fromBase64Url(value))) as T;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verify(value: string, signature: string) {
  return (await sign(value)) === signature;
}

async function seal<T>(payload: T) {
  const body = encodeJson(payload);
  return `${body}.${await sign(body)}`;
}

async function unseal<T>(sealed: string) {
  const [body, signature] = sealed.split(".");
  if (!body || !signature) {
    return null;
  }

  if (!(await verify(body, signature))) {
    return null;
  }

  return decodeJson<T>(body);
}

function isExpired(expiresAt: number) {
  return expiresAt <= Math.floor(Date.now() / 1000);
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getStateCookieName() {
  return STATE_COOKIE_NAME;
}

export async function sealSessionCookie(session: AppSession) {
  return seal(session);
}

export async function createStateCookie({
  realm,
  state,
  next,
}: {
  realm: string;
  state: string;
  next: string;
}) {
  return seal<AuthState>({
    realm,
    state,
    next,
    expiresAt: Math.floor(Date.now() / 1000) + stateTtlSeconds,
  });
}

export async function readSessionFromCookieValue(value: string) {
  const session = await unseal<AppSession>(value);
  if (!session || isExpired(session.expiresAt)) {
    return null;
  }

  return session;
}

export async function readStateCookie(value: string) {
  const state = await unseal<AuthState>(value);
  if (!state || isExpired(state.expiresAt)) {
    return null;
  }

  return state;
}

export function getDefaultLoginUrl(origin: string) {
  return new URL("/login", origin);
}

export function getAuthLoginUrl(origin: string, realm: string, state: string) {
  const url = new URL(
    `${getPublicRealmBaseUrl(realm)}/protocol/openid-connect/auth`,
  );
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("redirect_uri", `${origin}/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  return url;
}

export function getLogoutUrl(origin: string, realm: string, idToken?: string) {
  const url = new URL(
    `${getPublicRealmBaseUrl(realm)}/protocol/openid-connect/logout`,
  );
  url.searchParams.set("post_logout_redirect_uri", `${origin}/login`);
  url.searchParams.set("client_id", getClientId());
  if (idToken) {
    url.searchParams.set("id_token_hint", idToken);
  }
  return url;
}

export function readTokenClaims(idToken: string) {
  const [, payload] = idToken.split(".");
  if (!payload) {
    throw new Error("Invalid ID token");
  }

  return decodeJson<IdTokenClaims>(payload);
}
