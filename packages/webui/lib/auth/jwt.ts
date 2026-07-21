type IdTokenClaims = {
  sub?: string
  email?: string
  preferred_username?: string
  name?: string
  groups?: string[] | string
  exp?: number
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4
  const padded =
    padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`

  return Buffer.from(padded, "base64").toString("utf8")
}

export function readTokenClaims(token?: string | null): IdTokenClaims | null {
  if (!token) {
    return null
  }

  const [, payload] = token.split(".")
  if (!payload) {
    return null
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as IdTokenClaims
  } catch {
    return null
  }
}

export function normalizeGroups(groups?: string[] | string) {
  if (!groups) {
    return
  }

  const values = Array.isArray(groups) ? groups : [groups]
  const normalized = values.map((value) => value.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}
