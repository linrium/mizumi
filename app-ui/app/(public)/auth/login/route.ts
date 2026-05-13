import { NextRequest, NextResponse } from "next/server";
import {
  createStateCookie,
  getAuthLoginUrlForRequest,
  getStateCookieName,
  stateTtlSeconds,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/";
  const nextPath = requestedNext.startsWith("/") ? requestedNext : "/";
  const state = crypto.randomUUID();
  const redirectUrl = getAuthLoginUrlForRequest(request, state);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set({
    name: getStateCookieName(),
    value: await createStateCookie({ state, next: nextPath }),
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: stateTtlSeconds,
  });

  return response;
}
