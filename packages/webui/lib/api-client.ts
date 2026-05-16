"use client"

import type { AppSession } from "@/lib/auth/types"
import { authClient } from "@/lib/auth-client"

let isHandlingUnauthorized = false

async function getToken(): Promise<string | undefined> {
  const { data } = await authClient.getSession()
  const session = data as AppSession | null
  return session?.idToken
}

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

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  const response = await fetch(input, { ...init, headers })

  if (response.status === 401) {
    void handleUnauthorized()
  }

  return response
}
