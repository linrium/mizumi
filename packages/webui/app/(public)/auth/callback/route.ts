import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  clearStateCookie,
  exchangeAuthorizationCode,
  getDefaultLoginUrlForRequest,
  getSessionCookieName,
  getStateCookieName,
  readStateCookie,
  readTokenClaims,
  sealSessionCookie,
  sessionTtlSeconds,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const loginUrl = getDefaultLoginUrlForRequest(request);

  if (!code || !state) {
    return NextResponse.redirect(loginUrl);
  }

  const stateCookie = request.cookies.get(getStateCookieName())?.value;
  const pendingState = stateCookie ? await readStateCookie(stateCookie) : null;

  if (!pendingState || pendingState.state !== state) {
    const response = NextResponse.redirect(loginUrl);
    clearStateCookie(response);
    clearSessionCookie(response);
    return response;
  }

  try {
    const tokens = await exchangeAuthorizationCode(
      request,
      pendingState.realm,
      code,
    );
    const claims = readTokenClaims(tokens.id_token);
    const response = NextResponse.redirect(
      new URL(pendingState.next, request.nextUrl.origin),
    );

    response.cookies.set({
      name: getSessionCookieName(),
      value: await sealSessionCookie({
        realm: pendingState.realm,
        email: claims.email,
        preferredUsername: claims.preferred_username,
        name: claims.name,
        sub: claims.sub,
        idToken: tokens.id_token,
        expiresAt: claims.exp,
      }),
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: sessionTtlSeconds,
    });
    clearStateCookie(response);
    return response;
  } catch {
    const response = NextResponse.redirect(loginUrl);
    clearStateCookie(response);
    clearSessionCookie(response);
    return response;
  }
}
