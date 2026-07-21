"use client"

import { useEffect } from "react"
import { writeStoredIdToken } from "@/lib/auth/storage"

interface AuthHeaderProviderProps {
  idToken?: string
}

export function AuthHeaderProvider({ idToken }: AuthHeaderProviderProps) {
  useEffect(() => {
    writeStoredIdToken(idToken)
  }, [idToken])

  return null
}
