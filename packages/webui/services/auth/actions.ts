"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth, KEYCLOAK_PROVIDER_ID } from "@/services/auth"

function normalizeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/"
  }

  return value
}

export async function signInWithKeycloak(formData: FormData) {
  const callbackURL = normalizeNextPath(formData.get("next"))
  const requestHeaders = await headers()
  const response = await auth.api.signInWithOAuth2({
    headers: requestHeaders,
    body: {
      providerId: KEYCLOAK_PROVIDER_ID,
      callbackURL,
    },
  })

  redirect(response.url)
}

export async function signOut() {
  const requestHeaders = await headers()
  await auth.api.signOut({
    headers: requestHeaders,
  })

  redirect("/login")
}
