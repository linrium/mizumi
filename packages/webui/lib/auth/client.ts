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

export function writeStoredIdToken(idToken: string) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken)
  } catch {
    // Ignore storage failures and let the server-session fallback handle auth.
  }
}
