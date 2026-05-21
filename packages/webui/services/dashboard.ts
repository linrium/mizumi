import { deepseek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { MODELS, type ModelId } from "@/services/ai-models"
import { getServerSession } from "@/lib/auth"
import { fetchSchema } from "@/services/unity-catalog"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000"

const omlx = createOpenAI({
  baseURL: "http://localhost:3333/v1",
})
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
})

async function ensureSession(
  sessionId: string | null,
  token?: string,
): Promise<string> {
  if (sessionId) {
    return sessionId
  }

  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers,
  })
  if (!res.ok) {
    throw new Error(`Failed to create session: HTTP ${res.status}`)
  }

  const data = (await res.json()) as { session_id: string }
  return data.session_id
}

async function runSql(sessionId: string, sql: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/query`, {
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

const chartTypeEnum = z.enum(["bar", "line", "area", "pie", "scatter"])

export type PanelSummary = {
  id: string
  title: string
  chartType: string
  sql: string
  xCol: string
  yCol: string
}

export async function handleDashboardGenerate(req: NextRequest) {
  const session = await getServerSession()
  const idToken = session?.idToken
  const {
    messages,
    sessionId,
    modelId,
    panels,
    selectedPanelId,
    lastCreatedIds,
  } = (await req.json()) as {
    messages: unknown
    sessionId: string | null
    modelId: ModelId
    panels: PanelSummary[]
    selectedPanelId: string | null
    lastCreatedIds: string[]
  }

  const model = resolveModel(modelId ?? "gpt-5.4-nano")
  const resolvedSessionId = await ensureSession(sessionId, idToken)
  const schema = await fetchSchema().catch(() => "(schema unavailable)")

  const panelList =
    (panels ?? []).length > 0
      ? (panels ?? [])
          .map(
            (panel) =>
              `  id=${panel.id} title="${panel.title}" chartType=${panel.chartType} xCol=${panel.xCol} yCol=${panel.yCol}`,
          )
          .join("\n")
      : "  (none)"

  const contextHints = [
    selectedPanelId ? `Selected panel id: ${selectedPanelId}` : null,
    lastCreatedIds?.length
      ? `Last created panel ids: ${lastCreatedIds.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")

  const tools = {
    createPanel: tool({
      description:
        "Create a new dashboard panel with a chart. Call once per distinct metric or visualization the user asks for.",
      inputSchema: z.object({
        title: z.string().describe("Short panel title"),
        sql: z
          .string()
          .describe(
            "SQL query. Always use fully qualified names: <catalog>.<schema>.<table>",
          ),
        chartType: chartTypeEnum.describe(
          "bar → categories, line/area → time-series, pie → proportions ≤8 slices, scatter → correlation",
        ),
        xCol: z
          .string()
          .describe("Column for x-axis labels or pie slice names"),
        yCol: z.string().describe("Column for numeric values"),
        explanation: z
          .string()
          .describe("One sentence describing what this panel shows"),
        width: z.number().int().min(3).max(12).default(6),
        height: z.number().int().min(3).max(8).default(4),
      }),
      execute: async ({
        sql,
        title,
        chartType,
        xCol,
        yCol,
        explanation,
        width,
        height,
      }) => {
        try {
          const data = await runSql(resolvedSessionId, sql, idToken)
          return {
            title,
            sql,
            chartType,
            xCol,
            yCol,
            explanation,
            width,
            height,
            columns: data.columns,
            rows: data.rows,
            row_count: data.row_count,
          }
        } catch (error) {
          return {
            title,
            sql,
            chartType,
            xCol,
            yCol,
            explanation,
            width,
            height,
            error: (error as Error).message,
          }
        }
      },
    }),
    editPanel: tool({
      description:
        "Edit an existing dashboard panel. Use this when the user asks to change, update, fix, rename, or modify a panel. " +
        'To identify the target: use selectedPanelId when the user says "this panel" or "the selected one"; ' +
        'use lastCreatedIds when the user says "the last one" or "those panels"; ' +
        "otherwise match by title from the panels list. " +
        "Only include fields that need to change — omit unchanged ones.",
      inputSchema: z.object({
        panelId: z.string(),
        title: z.string().optional(),
        sql: z
          .string()
          .optional()
          .describe(
            "New SQL query (omit to keep existing). Always use fully qualified names: <catalog>.<schema>.<table>",
          ),
        chartType: chartTypeEnum.optional(),
        xCol: z.string().optional(),
        yCol: z.string().optional(),
        explanation: z
          .string()
          .describe("One sentence describing what changed"),
      }),
      execute: async ({
        panelId,
        title,
        sql,
        chartType,
        xCol,
        yCol,
        explanation,
      }) => {
        const target = (panels ?? []).find((panel) => panel.id === panelId)
        if (!target) {
          return { panelId, error: `Panel id "${panelId}" not found` }
        }

        const effectiveSql = sql ?? target.sql
        try {
          const data = await runSql(resolvedSessionId, effectiveSql, idToken)
          return {
            panelId,
            title: title ?? target.title,
            sql: effectiveSql,
            chartType: chartType ?? target.chartType,
            xCol: xCol ?? target.xCol,
            yCol: yCol ?? target.yCol,
            explanation,
            columns: data.columns,
            rows: data.rows,
            row_count: data.row_count,
          }
        } catch (error) {
          return {
            panelId,
            title: title ?? target.title,
            sql: effectiveSql,
            chartType: chartType ?? target.chartType,
            xCol: xCol ?? target.xCol,
            yCol: yCol ?? target.yCol,
            explanation,
            error: (error as Error).message,
          }
        }
      },
    }),
  }

  const result = streamText({
    model,
    system: `You are a data analyst managing dashboard panels for the Mizumi lakehouse platform.
You have two tools: createPanel (add new panels) and editPanel (modify existing panels).

## Current dashboard panels:
${panelList}

${contextHints ? `## Context:\n${contextHints}` : ""}

## When to use each tool:
- createPanel: user asks to add, show, visualize, or create something new
- editPanel: user asks to change, update, rename, fix, switch chart type, or modify an existing panel
  - "this panel" / "the selected one" → use selectedPanelId
  - "the last one" / "those panels" / "what you just created" → use lastCreatedIds
  - by name (e.g. "the revenue chart") → match against the panels list by title

## Tool call rules:
- Call tools IMMEDIATELY without preamble.
- Call createPanel MULTIPLE TIMES for multiple new metrics.
- Call editPanel MULTIPLE TIMES if editing several panels at once.
- After tool calls, write 1–2 sentences summarizing what changed.

## SQL rules:
- ONLY use catalogs, schemas, and tables from the "Available tables" list below.
- NEVER invent or guess catalog, schema, or table names — if it is not in the list, do not use it.
- Always use fully qualified 3-part names: <catalog>.<schema>.<table>
- Valid catalogs are: hdbank, vietjetair, partnership
- For time-series: ORDER BY the date/time column ascending

## Chart types:
- bar: categories/comparisons  · line/area: time-series trends  · pie: proportions ≤8 slices  · scatter: correlation

## Available tables:
${schema}

## On error:
If a tool returns an error field, quote it briefly and stop.`,
    messages: await convertToModelMessages(
      messages as Parameters<typeof convertToModelMessages>[0],
      { tools },
    ),
    tools,
    stopWhen: stepCountIs(15),
  })

  return result.toUIMessageStreamResponse({
    headers: { "X-Session-Id": resolvedSessionId },
  })
}
