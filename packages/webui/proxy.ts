import { NextRequest, NextResponse } from "next/server"
import {
  getSessionCookieName,
  readSessionFromCookieValue,
} from "@/lib/auth/core"

const PUBLIC_PATHS = ["/login", "/auth"]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname) ||
    isPublicPath(pathname)
  ) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get(getSessionCookieName())?.value
  const session = sessionCookie
    ? await readSessionFromCookieValue(sessionCookie)
    : null

  if (session) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/login", request.url)
  const next = pathname === "/" ? "/" : `${pathname}${search}`
  loginUrl.searchParams.set("next", next)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/:path*"],
}
