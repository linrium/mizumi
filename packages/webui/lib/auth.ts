import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { customSession, genericOAuth } from "better-auth/plugins"
import { headers } from "next/headers"
import { KEYCLOAK_PROVIDER_ID } from "@/lib/auth/constants"
import { normalizeGroups, readTokenClaims } from "@/lib/auth/jwt"
import type { AppSession } from "@/lib/auth/types"

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
    accessToken: input.accessToken ?? undefined,
    email: claims?.email ?? input.user.email,
    emailVerified: input.user.emailVerified,
    expiresAt: input.session.expiresAt,
    groups: normalizeGroups(claims?.groups),
    id: input.session.id,
    idToken: input.idToken ?? undefined,
    image: input.user.image,
    name: claims?.name ?? input.user.name,
    preferredUsername: claims?.preferred_username,
    realm: getRealmFromIssuer(getKeycloakIssuer()),
    sub: claims?.sub,
    userId: input.session.userId,
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
      body: {
        providerId: KEYCLOAK_PROVIDER_ID,
      },
      headers: requestHeaders,
    })
    const claims = readTokenClaims(tokens.idToken)

    return {
      ...session,
      accessToken: tokens.accessToken ?? session.accessToken,
      groups: normalizeGroups(claims?.groups) ?? session.groups,
      idToken: tokens.idToken ?? session.idToken,
      preferredUsername:
        claims?.preferred_username ?? session.preferredUsername,
      realm: getRealmFromIssuer(getKeycloakIssuer()),
      sub: claims?.sub ?? session.sub,
    }
  } catch {
    return session
  }
}

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  plugins: [
    genericOAuth({
      config: [
        {
          authorizationUrl: getKeycloakEndpoint(
            getKeycloakPublicBaseUrl(),
            "auth"
          ),
          clientId: process.env.KEYCLOAK_CLIENT_ID ?? "webui",
          clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "webui-secret",
          issuer: getKeycloakIssuer(),
          providerId: KEYCLOAK_PROVIDER_ID,
          scopes: ["openid", "profile", "email", "offline_access"],
          tokenUrl: getKeycloakEndpoint(getKeycloakInternalBaseUrl(), "token"),
          userInfoUrl: getKeycloakEndpoint(
            getKeycloakInternalBaseUrl(),
            "userinfo"
          ),
        },
      ],
    }),
    customSession(async ({ session, user }, ctx) => {
      const accounts = await ctx.context.internalAdapter.findAccounts(user.id)
      const account = accounts.find(
        (candidate) => candidate.providerId === KEYCLOAK_PROVIDER_ID
      )

      return buildAppSession({
        accessToken: account?.accessToken,
        idToken: account?.idToken,
        session,
        user,
      })
    }),
    nextCookies(),
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? "mizumi-webui-dev-auth-secret",
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
