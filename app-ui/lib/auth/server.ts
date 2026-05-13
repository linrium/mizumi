import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  createStateCookie,
  getAuthLoginUrl,
  getAvailableRealms,
  getClientId,
  getClientSecret,
  getDefaultRealm,
  getDefaultLoginUrl,
  getInternalRealmBaseUrl,
  getLogoutUrl,
  isAllowedRealm,
  getSessionCookieName,
  getStateCookieName,
  readSessionFromCookieValue,
  readStateCookie,
  readTokenClaims,
  sealSessionCookie,
  sessionTtlSeconds,
  stateTtlSeconds,
} from "@/lib/auth/core";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
};

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
};

export async function getServerSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(getSessionCookieName())?.value;

  if (!value) {
    return null;
  }

  return readSessionFromCookieValue(value);
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
  });
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
  });
}

export function getDefaultLoginUrlForRequest(request: NextRequest) {
  return getDefaultLoginUrl(request.nextUrl.origin);
}

export function getAuthLoginUrlForRequest(
  request: NextRequest,
  realm: string,
  state: string,
) {
  return getAuthLoginUrl(request.nextUrl.origin, realm, state);
}

export function getLogoutUrlForRequest(
  request: NextRequest,
  realm: string,
  idToken?: string,
) {
  return getLogoutUrl(request.nextUrl.origin, realm, idToken);
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
  );

  if (!response.ok) {
    throw new Error("Token exchange failed");
  }

  return (await response.json()) as TokenResponse;
}
