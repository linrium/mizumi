import { cookies } from "next/headers"
import type { NextRequest, NextResponse } from "next/server"
import type { AppSession } from "@/lib/auth/core"
import {
  createStateCookie,
  getAuthLoginUrl,
  getAvailableRealms,
  getClientId,
  getClientSecret,
  getDefaultLoginUrl,
  getDefaultRealm,
  getInternalRealmBaseUrl,
  getLogoutUrl,
  getSessionCookieName,
  getStateCookieName,
  isAllowedRealm,
  readSessionFromCookieValue,
  readStateCookie,
  readTokenClaims,
  sealSessionCookie,
  sessionTtlSeconds,
  stateTtlSeconds,
} from "@/lib/auth/core"

type TokenResponse = {
  access_token: string
  expires_in: number
  id_token: string
  refresh_expires_in?: number
  refresh_token?: string
  token_type: string
}

export {
  createStateCookie,
  getAvailableRealms,
  getDefaultRealm,
  getSessionCookieName,
  getStateCookieName,
  isAllowedRealm,
  readSessionFromCookieValue,
  readStateCookie,
  readTokenClaims,
  sealSessionCookie,
  sessionTtlSeconds,
  stateTtlSeconds,
}

function buildSessionFromTokenResponse(
  realm: string,
  tokens: TokenResponse,
  refreshToken?: string,
): AppSession {
  const claims = readTokenClaims(tokens.id_token)

  return {
    realm,
    email: claims.email,
    preferredUsername: claims.preferred_username,
    name: claims.name,
    groups: claims.groups,
    sub: claims.sub,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresAt: claims.exp,
  }
}

export async function getServerSession() {
  const result = await getServerSessionResult()
  return result.session
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: getSessionCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  })
}

export function clearStateCookie(response: NextResponse) {
  response.cookies.set({
    name: getStateCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  })
}

export function getDefaultLoginUrlForRequest(request: NextRequest) {
  return getDefaultLoginUrl(request.nextUrl.origin)
}

export function getAuthLoginUrlForRequest(
  request: NextRequest,
  realm: string,
  state: string,
) {
  return getAuthLoginUrl(request.nextUrl.origin, realm, state)
}

export function getLogoutUrlForRequest(
  request: NextRequest,
  realm: string,
  idToken?: string,
) {
  return getLogoutUrl(request.nextUrl.origin, realm, idToken)
}

export async function exchangeAuthorizationCode(
  request: NextRequest,
  realm: string,
  code: string,
) {
  const response = await fetch(
    `${getInternalRealmBaseUrl(realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: getClientId(),
        client_secret: getClientSecret(),
        code,
        redirect_uri: `${request.nextUrl.origin}/auth/callback`,
      }),
      cache: "no-store",
    },
  )

  if (!response.ok) {
    throw new Error("Token exchange failed")
  }

  return (await response.json()) as TokenResponse
}

export async function refreshSessionTokens(
  realm: string,
  refreshToken: string,
) {
  const response = await fetch(
    `${getInternalRealmBaseUrl(realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: getClientId(),
        client_secret: getClientSecret(),
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    },
  )

  if (!response.ok) {
    throw new Error("Token refresh failed")
  }

  return (await response.json()) as TokenResponse
}

export async function getServerSessionResult() {
  const cookieStore = await cookies()
  const value = cookieStore.get(getSessionCookieName())?.value

  if (!value) {
    return { session: null, sealedValue: null as string | null }
  }

  const session = await readSessionFromCookieValue(value)
  if (session) {
    return { session, sealedValue: null as string | null }
  }

  const expiredSession = await readSessionFromCookieValue(value, {
    allowExpired: true,
  })

  if (!expiredSession?.refreshToken) {
    return { session: null, sealedValue: null as string | null }
  }

  try {
    const refreshedTokens = await refreshSessionTokens(
      expiredSession.realm,
      expiredSession.refreshToken,
    )
    const refreshedSession = buildSessionFromTokenResponse(
      expiredSession.realm,
      refreshedTokens,
      expiredSession.refreshToken,
    )

    return {
      session: refreshedSession,
      sealedValue: await sealSessionCookie(refreshedSession),
    }
  } catch {
    return { session: null, sealedValue: null as string | null }
  }
}
