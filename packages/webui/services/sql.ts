import { z } from "zod"
import { apiFetch } from "@/lib/api-client"

export const sqlSchema = z.object({
  sql: z.string().min(1, "SQL query is required"),
})

export type QueryResponse = {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

export type SqlQueryResult =
  | { ok: true; data: QueryResponse; elapsed: number }
  | { ok: false; error: string }

type SessionLike = {
  session_id: string
}

type CreateSession = () => Promise<SessionLike | null>

export async function ensureSessionId(
  activeSessionId: string | null,
  createSession: CreateSession,
): Promise<string> {
  if (activeSessionId) {
    return activeSessionId
  }

  const session = await createSession()
  if (!session) {
    throw new Error("Failed to create session")
  }

  return session.session_id
}

export async function runSessionSqlQuery(
  sessionId: string,
  sql: string,
): Promise<QueryResponse> {
  const res = await apiFetch(`/api/sessions/${sessionId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return body as QueryResponse
}

export async function runSqlQuery(sql: string): Promise<QueryResponse> {
  const res = await apiFetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return body as QueryResponse
}

export async function executeSessionSqlQuery(input: {
  sql: string
  activeSessionId: string | null
  createSession: CreateSession
}): Promise<SqlQueryResult> {
  const startedAt = Date.now()

  try {
    const sessionId = await ensureSessionId(
      input.activeSessionId,
      input.createSession,
    )
    const data = await runSessionSqlQuery(sessionId, input.sql)

    return {
      ok: true,
      data,
      elapsed: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function executeSqlQuery(sql: string): Promise<SqlQueryResult> {
  const startedAt = Date.now()

  try {
    const data = await runSqlQuery(sql)

    return {
      ok: true,
      data,
      elapsed: Date.now() - startedAt,
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export function formatQueryResultsAsTsv(queryResult: QueryResponse): string {
  const header = queryResult.columns.join("\t")
  const rows = queryResult.rows
    .map((row) => row.map(String).join("\t"))
    .join("\n")
  return `${header}\n${rows}`
}
