"use client"

import { authClient } from "@/lib/auth-client"
import type { AppSession } from "@/lib/auth/types"

async function getToken(): Promise<string | undefined> {
  const { data } = await authClient.getSession()
  const session = data as AppSession | null
  return session?.idToken
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
  return fetch(input, { ...init, headers })
}
