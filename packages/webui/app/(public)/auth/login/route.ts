import { NextRequest, NextResponse } from "next/server";
import {
  createStateCookie,
  getAuthLoginUrlForRequest,
  getDefaultRealm,
  isAllowedRealm,
  getStateCookieName,
  stateTtlSeconds,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  const requestedRealm = request.nextUrl.searchParams.get("realm") ?? "";
  const nextPath = requestedNext.startsWith("/") ? requestedNext : "/";
  const realm = isAllowedRealm(requestedRealm)
    ? requestedRealm
    : getDefaultRealm();
  const state = crypto.randomUUID();
  const redirectUrl = getAuthLoginUrlForRequest(request, realm, state);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set({
    name: getStateCookieName(),
    value: await createStateCookie({ realm, state, next: nextPath }),
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: stateTtlSeconds,
  });

  return response;
}
