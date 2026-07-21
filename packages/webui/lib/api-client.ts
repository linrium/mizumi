"use client"

import { KEYCLOAK_PROVIDER_ID } from "@/lib/auth/constants"
import { readStoredIdToken, writeStoredIdToken } from "@/lib/auth/storage"
import type { AppSession } from "@/lib/auth/types"
import { authClient } from "@/lib/auth-client"

// Serializes concurrent refresh attempts so only one token refresh fires at a time.
let refreshPromise: Promise<string | undefined> | null = null

async function fetchFreshIdToken(): Promise<string | undefined> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/get-access-token", {
        body: JSON.stringify({ providerId: KEYCLOAK_PROVIDER_ID }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })

      if (!res.ok) {
        return
      }

      const data = (await res.json()) as {
        idToken?: string
        accessToken?: string
      }
      const token = data.idToken ?? data.accessToken

      // Keep localStorage in sync so the fallback path stays fresh.
      writeStoredIdToken(token)

      return token
    } catch {
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function getToken(): Promise<string | undefined> {
  const { data } = await authClient.getSession()
  const session = data as AppSession | null
  return session?.idToken ?? readStoredIdToken() ?? undefined
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status !== 401) {
    return response
  }

  // Token expired — attempt a silent refresh and retry once.
  const freshToken = await fetchFreshIdToken()
  if (!freshToken) {
    void handleUnauthorized()
    return response
  }

  const retryHeaders = new Headers(init?.headers)
  retryHeaders.set("Authorization", `Bearer ${freshToken}`)

  // Only replay requests with replayable bodies (strings, objects, null/undefined).
  // Streams and consumed ReadableBody objects cannot be replayed.
  const bodyIsReplayable =
    !init?.body ||
    typeof init.body === "string" ||
    init.body instanceof URLSearchParams ||
    init.body instanceof FormData ||
    init.body instanceof ArrayBuffer

  if (!bodyIsReplayable) {
    void handleUnauthorized()
    return response
  }

  const retryResponse = await fetch(input, { ...init, headers: retryHeaders })

  if (retryResponse.status === 401) {
    void handleUnauthorized()
  }

  return retryResponse
}

let isHandlingUnauthorized = false

async function handleUnauthorized() {
  if (isHandlingUnauthorized) {
    return
  }

  isHandlingUnauthorized = true

  try {
    await authClient.signOut()
  } catch {
    // Ignore sign-out failures and still force navigation to login.
  } finally {
    window.location.replace("/login")
  }
}
