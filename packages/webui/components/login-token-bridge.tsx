"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { writeStoredIdToken } from "@/lib/auth/client"

type LoginTokenBridgeProps = {
  idToken: string
  nextPath: string
}

export function LoginTokenBridge({ idToken, nextPath }: LoginTokenBridgeProps) {
  const router = useRouter()

  useEffect(() => {
    writeStoredIdToken(idToken)
    router.replace(nextPath)
  }, [idToken, nextPath, router])

  return (
    <p className="text-center text-[11px] text-muted-foreground">
      Completing sign-in...
    </p>
  )
}
