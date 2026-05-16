"use client"

export const ID_TOKEN_STORAGE_KEY = "mizumi.id_token"

export function readStoredIdToken() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.localStorage.getItem(ID_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredIdToken(idToken?: string | null) {
  if (typeof window === "undefined") {
    return
  }

  try {
    if (idToken) {
      window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken)
      return
    }

    window.localStorage.removeItem(ID_TOKEN_STORAGE_KEY)
  } catch {
    // Ignore storage failures and let the server-session fallback handle auth.
  }
}
