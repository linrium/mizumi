"use client"

import { useEffect } from "react"
import { writeStoredIdToken } from "@/services/auth/storage"

type AuthHeaderProviderProps = {
  idToken?: string
}

export function AuthHeaderProvider({ idToken }: AuthHeaderProviderProps) {
  useEffect(() => {
    writeStoredIdToken(idToken)
  }, [idToken])

  return null
}
