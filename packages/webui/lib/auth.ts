import { headers } from "next/headers"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { customSession, genericOAuth } from "better-auth/plugins"
import type { AppSession } from "@/lib/auth/types"
import { KEYCLOAK_PROVIDER_ID } from "@/lib/auth/constants"
import { normalizeGroups, readTokenClaims } from "@/lib/auth/jwt"

const DEFAULT_BASE_URL = "http://localhost:3000"
const DEFAULT_REALM = "sovico"
const DEFAULT_KEYCLOAK_PUBLIC_BASE_URL = "http://127.0.0.1:8083"
const AUTH_ROUTE_BASE = "/api/auth"

function getBaseUrl() {
  const configured =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    DEFAULT_BASE_URL

  return configured.endsWith(AUTH_ROUTE_BASE)
    ? configured
    : `${configured.replace(/\/$/, "")}${AUTH_ROUTE_BASE}`
}

function getKeycloakIssuer() {
  return (
    process.env.KEYCLOAK_ISSUER ??
    `${getKeycloakPublicBaseUrl()}/realms/${getKeycloakRealm()}`
  )
}

function getKeycloakRealm() {
  return process.env.KEYCLOAK_REALM ?? DEFAULT_REALM
}

function getKeycloakPublicBaseUrl() {
  return (
    process.env.KEYCLOAK_PUBLIC_BASE_URL ?? DEFAULT_KEYCLOAK_PUBLIC_BASE_URL
  )
}

function getKeycloakInternalBaseUrl() {
  return process.env.KEYCLOAK_INTERNAL_BASE_URL ?? getKeycloakPublicBaseUrl()
}

function getKeycloakEndpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/realms/${getKeycloakRealm()}/protocol/openid-connect/${path}`
}

function getRealmFromIssuer(issuer: string) {
  const match = issuer.match(/\/realms\/([^/]+)$/)
  return match?.[1] ?? DEFAULT_REALM
}

function buildAppSession(input: {
  session: {
    id: string
    userId: string
    expiresAt: Date
  }
  user: {
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
  }
  idToken?: string | null
  accessToken?: string | null
}): AppSession {
  const claims = readTokenClaims(input.idToken)

  return {
    id: input.session.id,
    userId: input.session.userId,
    name: claims?.name ?? input.user.name,
    email: claims?.email ?? input.user.email,
    emailVerified: input.user.emailVerified,
    image: input.user.image,
    realm: getRealmFromIssuer(getKeycloakIssuer()),
    sub: claims?.sub,
    preferredUsername: claims?.preferred_username,
    groups: normalizeGroups(claims?.groups),
    idToken: input.idToken ?? undefined,
    accessToken: input.accessToken ?? undefined,
    expiresAt: input.session.expiresAt,
  }
}

async function hydrateSessionTokens(
  session: AppSession | null,
  requestHeaders: Headers
) {
  if (!session) {
    return null
  }

  try {
    const tokens = await auth.api.getAccessToken({
      headers: requestHeaders,
      body: {
        providerId: KEYCLOAK_PROVIDER_ID,
      },
    })
    const claims = readTokenClaims(tokens.idToken)

    return {
      ...session,
      realm: getRealmFromIssuer(getKeycloakIssuer()),
      sub: claims?.sub ?? session.sub,
      preferredUsername:
        claims?.preferred_username ?? session.preferredUsername,
      groups: normalizeGroups(claims?.groups) ?? session.groups,
      idToken: tokens.idToken ?? session.idToken,
      accessToken: tokens.accessToken ?? session.accessToken,
    }
  } catch {
    return session
  }
}

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET ?? "mizumi-webui-dev-auth-secret",
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: KEYCLOAK_PROVIDER_ID,
          clientId: process.env.KEYCLOAK_CLIENT_ID ?? "webui",
          clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "webui-secret",
          issuer: getKeycloakIssuer(),
          authorizationUrl: getKeycloakEndpoint(
            getKeycloakPublicBaseUrl(),
            "auth"
          ),
          tokenUrl: getKeycloakEndpoint(getKeycloakInternalBaseUrl(), "token"),
          userInfoUrl: getKeycloakEndpoint(
            getKeycloakInternalBaseUrl(),
            "userinfo"
          ),
          scopes: ["openid", "profile", "email", "offline_access"],
        },
      ],
    }),
    customSession(async ({ session, user }, ctx) => {
      const accounts = await ctx.context.internalAdapter.findAccounts(user.id)
      const account = accounts.find(
        (candidate) => candidate.providerId === KEYCLOAK_PROVIDER_ID
      )

      return buildAppSession({
        session,
        user,
        idToken: account?.idToken,
        accessToken: account?.accessToken,
      })
    }),
    nextCookies(),
  ],
})

export async function getServerSession() {
  const requestHeaders = await headers()
  return getSessionFromHeaders(requestHeaders)
}

export async function getSessionFromHeaders(
  requestHeaders: Headers,
  options?: { includeTokens?: boolean }
) {
  const session = await auth.api.getSession({
    headers: requestHeaders,
  })
  if (options?.includeTokens === false) {
    return session
  }

  return hydrateSessionTokens(session, requestHeaders)
}

export { KEYCLOAK_PROVIDER_ID }
