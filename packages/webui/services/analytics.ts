import { deepseek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { MODELS, type ModelId } from "@/services/ai-models"
import { getServerSession } from "@/lib/auth"
import { fetchSchema, FALLBACK_SCHEMA } from "@/services/unity-catalog"

const API_BASE =
  process.env.API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "http://controlplane-svc.controlplane.svc.cluster.local:4000"
    : "http://localhost:4000")

const omlx = createOpenAI({
  baseURL: "http://localhost:3333/v1",
})
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
})

async function fetchMyPermissionRequests(status?: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const url = new URL(`${API_BASE}/api/permissions/requests`)
  if (status && status !== "all") url.searchParams.set("status", status)

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.requests as Array<{
    id: string
    code: string
    resource: string
    scope: string
    status: string
    submitted_at: string
    privileges: string[]
    rationale: string
    expires_in_days: number
    queue_decision: string
  }>
}

async function fetchPermissionRequest(idOrCode: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const code = idOrCode.trim()

  // UUID format — direct lookup
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
    const res = await fetch(
      `${API_BASE}/api/permissions/requests/${encodeURIComponent(code)}`,
      { headers },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  // PR-XXXXXXXX format — extract the 8-char suffix and search
  const suffix = code.toUpperCase().startsWith("PR-")
    ? code.slice(3).toLowerCase()
    : code.toLowerCase()
  const res = await fetch(
    `${API_BASE}/api/permissions/requests?search=${encodeURIComponent(suffix)}`,
    { headers },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { requests: Array<{ code: string }> }
  const requests = data.requests ?? []
  const normalized = code.toUpperCase().startsWith("PR-") ? code.toUpperCase() : `PR-${code.toUpperCase()}`
  const match = requests.find((r) => r.code.toUpperCase() === normalized)
  if (!match) {
    if (requests.length > 0) return requests[0]
    throw new Error(`Request "${code}" not found`)
  }
  return match
}

async function runSql(sessionId: string | null, sql: string, token?: string) {
  const sid = sessionId ?? "default"
  const url = `${API_BASE}/api/sessions/${sid}/query`
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql, idToken: token }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return data as { columns: string[]; rows: unknown[][]; row_count: number }
}

type AccessibleTableRef = {
  catalog: string
  schemaName: string
  tableName: string
  searchText: string
}

function parseAccessibleTables(schema: string): AccessibleTableRef[] {
  return schema.split(/\n\s*\n/).flatMap((block) => {
    const match = block.match(/^TABLE\s+([^.]+)\.([^.]+)\.([^:\n]+):/m)
    if (!match) return []

    const [, catalog, schemaName, tableName] = match
    return [
      {
        catalog,
        schemaName,
        tableName,
        searchText: block.toLowerCase(),
      },
    ]
  })
}

function getAccessibleCatalogs(schema: string, search?: string): string[] {
  const terms = (search ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  const catalogs = new Set<string>()

  for (const table of parseAccessibleTables(schema)) {
    const haystack = `${table.catalog} ${table.schemaName} ${table.tableName} ${table.searchText}`
    if (terms.length > 0 && !terms.every((term) => haystack.includes(term))) {
      continue
    }
    catalogs.add(table.catalog)
  }

  return [...catalogs].sort((a, b) => a.localeCompare(b))
}

function resolveModel(modelId: ModelId): LanguageModel {
  if (modelId === "gpt-5.4-nano") {
    return openai("gpt-5.4-nano")
  }
  if (modelId === "mlx-community/Qwen3.5-9B-MLX-4bit") {
    return omlx("mlx-community/Qwen3.5-9B-MLX-4bit")
  }
  if (modelId === "mlx-community/Qwen3.6-35B-A3B-4bit") {
    return omlx("mlx-community/Qwen3.6-35B-A3B-4bit")
  }
  return deepseek("deepseek-chat")
}

export async function handleAnalyticsChat(req: NextRequest) {
  const { messages, sessionId, modelId } = await req.json()
  const session = await getServerSession()
  const idToken = session?.idToken
  const model = resolveModel((modelId as ModelId) ?? "gpt-5.4-nano")
  const schema = await fetchSchema(idToken).catch(() => "(schema unavailable)")

  const tools = {
    runQuery: tool({
      description:
        "Execute a SQL query and display the results in a data grid. Call this whenever the user asks to see, list, fetch, or query data.",
      inputSchema: z.object({
        sql: z.string().describe("The SQL query to execute"),
        explanation: z
          .string()
          .describe("One sentence describing what this query returns"),
      }),
      execute: async ({ sql, explanation }) => {
        try {
          const data = await runSql(sessionId, sql, idToken)
          return {
            sql,
            explanation,
            columns: data.columns,
            rows: data.rows,
            row_count: data.row_count,
          }
        } catch (error) {
          return { sql, explanation, error: (error as Error).message }
        }
      },
    }),
    exploreCatalog: tool({
      description: [
        "ALWAYS call this tool when the user asks anything about data discovery, access, or availability.",
        "Trigger phrases (call immediately, no preamble):",
        "  - 'I want to access X' / 'I want to get X'",
        "  - 'where can I get X' / 'how to get X' / 'how do I get X'",
        "  - 'is there any X data' / 'is there anything interesting in X'",
        "  - 'what data does X have' / 'does X have Y'",
        "  - 'can I access X' / 'get me access to X'",
        "  - ANY mention of a catalog or company name (hdbank, vietjet, partnership) NOT in 'Available tables'",
        "Returns only the catalogs the current user can already access.",
        "For `search`: extract the main subject keywords from the user's message (e.g. 'I want to access hdbank customers' → search='hdbank customer'; 'interesting data in hdbank' → search='hdbank').",
      ].join(" "),
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe(
            "Keywords extracted from the user's message. For 'I want to access hdbank customers' → 'hdbank customer'. For 'interesting data in hdbank' → 'hdbank'. Omit only to list all accessible catalogs.",
          ),
      }),
      execute: async ({ search }) => {
        if (schema === "(schema unavailable)" || schema === FALLBACK_SCHEMA) {
          return {
            search: search ?? null,
            catalogs: [],
            overview:
              "I could not load your access-scoped catalog right now, so I’m not returning any catalogs. Try again when your Unity Catalog access list is available.",
          }
        }

        const catalogs = getAccessibleCatalogs(schema, search)
        const overview =
          catalogs.length > 0
            ? `You can access ${catalogs.length} catalog${catalogs.length === 1 ? "" : "s"} right now.`
            : `No accessible catalogs matched ${search ? `"${search}"` : "your current filter"}.`

        return { search: search ?? null, catalogs, overview }
      },
    }),
    prepareAccessRequest: tool({
      description:
        "Prepare (but do not submit) an access request for a resource the user cannot query. Shows a confirmation card in the chat — the user must click 'Request Access' to actually submit it.",
      inputSchema: z.object({
        resource: z
          .string()
          .describe(
            "Fully qualified resource path, e.g. vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1",
          ),
        scope: z
          .enum(["catalog", "schema", "table"])
          .describe("Granularity of the access being requested"),
        privileges: z
          .array(z.string())
          .describe(
            "Privileges to request — SELECT for tables, USE SCHEMA for schemas, USE CATALOG for catalogs",
          ),
        rationale: z
          .string()
          .describe("Pre-filled rationale explaining why the user needs this data"),
        suggested_duration_days: z
          .number()
          .default(30)
          .describe("Suggested duration in days (default 30)"),
        explanation: z
          .string()
          .describe(
            "Short explanation shown to the user about what this data is and why they might want it",
          ),
      }),
      execute: async ({ resource, scope, privileges, rationale, suggested_duration_days, explanation }) => ({
        resource,
        scope,
        privileges,
        rationale,
        suggested_duration_days,
        explanation,
      }),
    }),
    listMyAccessRequests: tool({
      description:
        "List all of the current user's own permission requests. Use when the user asks 'show my requests', 'what access have I requested', 'my pending requests', 'show me my access requests', etc.",
      inputSchema: z.object({
        status: z
          .enum(["all", "pending", "approved", "cancelled", "needs-info", "ready"])
          .optional()
          .describe("Filter by status. Omit to return all statuses."),
      }),
      execute: async ({ status }) => {
        try {
          const requests = await fetchMyPermissionRequests(status, idToken)
          return { requests }
        } catch (error) {
          return { requests: [], error: (error as Error).message }
        }
      },
    }),
    checkAccessRequestStatus: tool({
      description:
        "Check the current status of a permission request by its ID or code (e.g. PR-ABCD1234). Use when the user asks about the status, approval, or outcome of an access request.",
      inputSchema: z.object({
        request_id: z
          .string()
          .describe(
            "The request UUID or short code, e.g. PR-ABCD1234 or a full UUID like 123e4567-e89b-12d3-a456-426614174000",
          ),
      }),
      execute: async ({ request_id }) => {
        try {
          return await fetchPermissionRequest(request_id, idToken)
        } catch (error) {
          return { error: (error as Error).message }
        }
      },
    }),
    visualizeChart: tool({
      description:
        "Run a SQL query and render the result as a chart. Call this when the user asks to visualize, plot, or chart data, or when a chart would better communicate the answer than a table.",
      inputSchema: z.object({
        sql: z.string().describe("SQL query whose result will be charted"),
        title: z.string().describe("Short chart title"),
        chartType: z
          .enum(["bar", "line", "area", "pie", "scatter"])
          .describe(
            "bar → categories, line → time-series, area → cumulative/trends, pie → proportions ≤8 slices, scatter → correlation between two numeric columns",
          ),
        x: z.string().describe("Column name for x-axis labels"),
        y: z.string().describe("Column name for numeric values"),
        explanation: z
          .string()
          .describe("One sentence describing what this chart shows"),
      }),
      execute: async ({ sql, title, chartType, x, y, explanation }) => {
        try {
          const data = await runSql(sessionId, sql, idToken)
          return {
            sql,
            title,
            chartType,
            x,
            y,
            explanation,
            columns: data.columns,
            rows: data.rows,
          }
        } catch (error) {
          return {
            sql,
            title,
            chartType,
            x,
            y,
            explanation,
            error: (error as Error).message,
          }
        }
      },
    }),
  }

  const result = streamText({
    model,
    system: `You are a data analyst for the Mizumi lakehouse platform. You have six tools: runQuery, visualizeChart, exploreCatalog, listMyAccessRequests, prepareAccessRequest, and checkAccessRequestStatus.

## HARD RULES — follow these exactly, no exceptions:

1. ANY of the following → call exploreCatalog IMMEDIATELY with keywords extracted from the message. Do NOT answer from memory. Do NOT check "Available tables" first.
   - "I want to access X" / "I want to get X"
   - "where can I get X" / "how to get X" / "how do I get X" / "how do I access X"
   - "is there any X data" / "is there anything interesting in X" / "what interesting data in X"
   - "what data does X have" / "does X have Y" / "what tables in X"
   - "can I access X" / "get me access to X"
   - ANY mention of a catalog or company name that is NOT in "Available tables"

2. The user asks about data NOT in "Available tables" → call exploreCatalog first.

3. runQuery or visualizeChart returns a permission / forbidden / 403 error → call prepareAccessRequest immediately.

4. User says "show my requests", "my access requests", "pending requests" → call listMyAccessRequests.

5. User mentions a request code like "PR-ABCD1234" → call checkAccessRequestStatus.

6. User asks to query or visualize data present in "Available tables" → call runQuery or visualizeChart.

## NEVER:
- Answer a "how to get / access" question from memory or the schema list alone — always call exploreCatalog.
- Run SQL against a table not in "Available tables".
- Invent catalog, schema, or table names.

## Tool quick reference:
- runQuery → query data the user can access
- visualizeChart → chart data the user can access
- exploreCatalog(search) → list the catalogs the user can access right now; use for ANY "want to access / where can I get / interesting data in X" question
- listMyAccessRequests → show the user's own permission requests
- prepareAccessRequest → ONLY when the user explicitly asks to request access, or when a query returns a permission error
- checkAccessRequestStatus → look up a specific request by code or ID

## Discovery → access workflow:
1. exploreCatalog returns results → tell the user which accessible catalogs exist
2. STOP. Do NOT call prepareAccessRequest automatically.
3. Only call prepareAccessRequest if the user explicitly asks to request access (e.g. "request access", "I want access", "how do I get access to this")

## SQL rules:
- ONLY query tables listed in "Available tables" below.
- Always use fully qualified 3-part names: <catalog>.<schema>.<table>

## Privilege rules for prepareAccessRequest:
- Table access: scope="table", privileges=["SELECT"]
- Schema access: scope="schema", privileges=["USE SCHEMA", "SELECT"]
- Catalog access: scope="catalog", privileges=["USE CATALOG", "USE SCHEMA", "SELECT"]

## After a successful tool call:
- NEVER render data as a markdown table — the UI renders it automatically.
- Write 1–2 sentences of interpretation only.

## Error handling:
- If a tool returns an error field, quote it and STOP (unless it is a permission error → prepareAccessRequest).

## Available tables:
${schema}

## After a successful tool call:
- NEVER render data as a markdown table or list — the UI renders results automatically.
- Write 1–2 sentences interpreting the results only.`,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
