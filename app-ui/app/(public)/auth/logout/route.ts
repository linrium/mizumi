import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  getLogoutUrlForRequest,
  getSessionCookieName,
  readSessionFromCookieValue,
} from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(getSessionCookieName())?.value;
  const session = sessionCookie
    ? await readSessionFromCookieValue(sessionCookie)
    : null;
  const response = NextResponse.redirect(
    getLogoutUrlForRequest(request, session?.idToken),
  );

  clearSessionCookie(response);
  return response;
}
