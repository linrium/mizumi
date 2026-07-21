"use client"

import { useCallback, useState } from "react"
import { apiFetch } from "@/lib/api-client"

export type Session = {
  session_id: string
  pod: string
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sessions")
      if (!res.ok) return
      const data: { sessions: Session[] } = await res.json()
      const list = data.sessions ?? []
      setSessions(list)
      if (list.length > 0) setActiveId((prev) => prev ?? list[0].session_id)
    } catch {}
  }, [])

  const createSession = useCallback(async (): Promise<Session | null> => {
    setCreating(true)
    try {
      const res = await apiFetch("/api/sessions", { method: "POST" })
      if (!res.ok) return null
      const session: Session = await res.json()
      setSessions((prev) => [...prev, session])
      setActiveId(session.session_id)
      return session
    } catch {
      return null
    } finally {
      setCreating(false)
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      await apiFetch(`/api/sessions/${id}`, { method: "DELETE" })
      setSessions((prev) => {
        const next = prev.filter((s) => s.session_id !== id)
        setActiveId((curr) =>
          curr === id ? (next[0]?.session_id ?? null) : curr
        )
        return next
      })
    } finally {
      setDeleting(null)
    }
  }, [])

  return {
    sessions,
    activeId,
    setActiveId,
    creating,
    deleting,
    fetchSessions,
    createSession,
    deleteSession,
  }
}
