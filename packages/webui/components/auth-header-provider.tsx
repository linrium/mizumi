"use client"

import { useEffect } from "react"
import { readStoredIdToken } from "@/lib/auth/client"

function shouldAttachHeader(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input.startsWith("/api/")
  }

  if (input instanceof URL) {
    return (
      input.origin === window.location.origin &&
      input.pathname.startsWith("/api/")
    )
  }

  return (
    input.url.startsWith(`${window.location.origin}/api/`) ||
    input.url.startsWith("/api/")
  )
}

export function AuthHeaderProvider() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!shouldAttachHeader(input)) {
        return originalFetch(input, init)
      }

      const idToken = readStoredIdToken()
      if (!idToken) {
        return originalFetch(input, init)
      }

      if (input instanceof Request) {
        const headers = new Headers(init?.headers ?? input.headers)
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${idToken}`)
        }
        return originalFetch(new Request(input, { ...init, headers }))
      }

      const headers = new Headers(init?.headers)
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${idToken}`)
      }

      return originalFetch(input, { ...init, headers })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
