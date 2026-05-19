import { deepseek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { MODELS, type ModelId } from "@/services/ai-models"
import { getServerSession } from "@/lib/auth"
import { fetchSchema } from "@/services/unity-catalog"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000"

const omlx = createOpenAI({
  baseURL: "http://localhost:3333/v1",
})
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
})

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

function resolveModel(modelId: ModelId): LanguageModel {
  if (modelId === "gpt-5.4-mini") {
    return openai("gpt-5.4-mini")
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
  const model = resolveModel((modelId as ModelId) ?? "gpt-5.4-mini")
  const schema = await fetchSchema().catch(() => "(schema unavailable)")

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
    system: `You are a data analyst for the Mizumi lakehouse platform. You have two tools: runQuery and visualizeChart.

## Tool selection:
- runQuery → user wants to see raw data, run a query, or inspect a table
- visualizeChart → user asks to visualize, plot, chart, or when a chart communicates the answer better

## CALL A TOOL IMMEDIATELY, without preamble, when the user:
- asks to show, list, display, get, fetch, or query any table or data
- mentions a table name (e.g. gold_customer_stats, banking.transactions.silver_transactions)
- asks for top N, counts, sums, averages, trends, comparisons, rankings
- asks to visualize, plot, chart, or graph anything

## WHEN NOT TO CALL A TOOL:
- purely conversational messages ("thanks", "what is Mizumi?")
- questions about the schema you can answer from the list below

## SQL rules:
- ONLY use catalogs, schemas, and tables from the "Available tables" list below.
- NEVER invent or guess catalog, schema, or table names — if it is not in the list, do not use it.
- Always use fully qualified 3-part names: <catalog>.<schema>.<table>
- Valid catalogs are: hdbank, vietjetair, partnership
- If the user provides a fully qualified name, verify it exists in the list before using it

## Error handling:
- If a tool returns an error field, quote it exactly and STOP.
- If the result is empty (0 rows), say so and STOP.

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
