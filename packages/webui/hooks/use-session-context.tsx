"use client"

import { createContext, type ReactNode, useContext, useEffect } from "react"
import { type Session, useSessions } from "@/hooks/use-sessions"

interface SessionContextValue {
  activeId: string | null
  createSession: () => Promise<Session | null>
  creating: boolean
  deleteSession: (id: string) => Promise<void>
  deleting: string | null
  fetchSessions: () => Promise<void>
  sessions: Session[]
  setActiveId: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessions()

  useEffect(() => {
    value.fetchSessions()
  }, [value.fetchSessions])

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error("useSessionContext must be used inside SessionProvider")
  }
  return ctx
}
