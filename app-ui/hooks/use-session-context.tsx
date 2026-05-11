'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useSessions, type Session } from '@/hooks/use-sessions'

type SessionContextValue = {
  sessions: Session[]
  activeId: string | null
  setActiveId: (id: string) => void
  creating: boolean
  deleting: string | null
  createSession: () => Promise<Session | null>
  deleteSession: (id: string) => Promise<void>
  fetchSessions: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessions()

  useEffect(() => { value.fetchSessions() }, [value.fetchSessions])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSessionContext must be used inside SessionProvider')
  return ctx
}
