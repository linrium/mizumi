import { deepseek } from '@ai-sdk/deepseek'
import { createOpenAI } from '@ai-sdk/openai'
import { createOllama } from 'ollama-ai-provider-v2'
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { LanguageModel } from 'ai'

const UC_BASE = process.env.UC_BASE_URL ?? 'http://localhost:8082/api/2.1/unity-catalog'
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000'

const ollama = createOllama({ baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api' })
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
})

type ColumnInfo = { name: string; type_text: string }
type TableDetail = { name: string; columns: ColumnInfo[] }

async function fetchSchema(): Promise<string> {
  const tablesRes = await fetch(
    `${UC_BASE}/tables?catalog_name=mizumi&schema_name=default&max_results=100`,
    { cache: 'no-store' },
  )
  if (!tablesRes.ok) return '(schema unavailable)'
  const { tables }: { tables: { name: string }[] } = await tablesRes.json()

  const details = await Promise.all(
    (tables ?? []).map(async (t) => {
      const r = await fetch(`${UC_BASE}/tables/mizumi.default.${t.name}`, { cache: 'no-store' })
      if (!r.ok) return null
      return r.json() as Promise<TableDetail>
    }),
  )

  return details
    .filter(Boolean)
    .map((t) => {
      const cols = (t!.columns ?? []).map((c) => `  ${c.name} ${c.type_text}`).join(',\n')
      return `TABLE mizumi.default.${t!.name}:\n${cols}`
    })
    .join('\n\n')
}

async function runSql(sessionId: string | null, sql: string) {
  const url = sessionId
    ? `${API_BASE}/api/sessions/${sessionId}/query`
    : `${API_BASE}/api/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as { columns: string[]; rows: unknown[][]; row_count: number }
}

export type ModelId = 'deepseek-chat' | 'gpt-5.4-mini' | 'qwen3.5:9b'

export const MODELS: { id: ModelId; label: string }[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
]

function resolveModel(modelId: ModelId): LanguageModel {
  if (modelId === 'gpt-5.4-mini') return openai('gpt-5.4-mini')
  if (modelId === 'qwen3.5:9b') return ollama('qwen3.5:9b')
  return deepseek('deepseek-chat')
}

export async function POST(req: NextRequest) {
  const { messages, sessionId, modelId } = await req.json()

  const model = resolveModel((modelId as ModelId) ?? 'gpt-5.4-mini')
  const schema = await fetchSchema().catch(() => '(schema unavailable)')

  const tools = {
    runQuery: tool({
      description:
        'Execute a SQL query and display the results in a data grid. Call this whenever the user asks to see, list, fetch, or query data.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL query to execute'),
        explanation: z.string().describe('One sentence describing what this query returns'),
      }),
      execute: async ({ sql, explanation }) => {
        try {
          const data = await runSql(sessionId, sql)
          return {
            sql,
            explanation,
            columns: data.columns,
            rows: data.rows,
            row_count: data.row_count,
          }
        } catch (e) {
          return { sql, explanation, error: (e as Error).message }
        }
      },
    }),

    visualizeChart: tool({
      description:
        'Run a SQL query and render the result as a chart. Call this when the user asks to visualize, plot, or chart data, or when a chart would better communicate the answer than a table.',
      inputSchema: z.object({
        sql: z.string().describe('SQL query whose result will be charted'),
        title: z.string().describe('Short chart title'),
        chartType: z.enum(['bar', 'line', 'pie']).describe('bar → categories, line → time-series, pie → proportions ≤8 slices'),
        x: z.string().describe('Column name for x-axis labels'),
        y: z.string().describe('Column name for numeric values'),
        explanation: z.string().describe('One sentence describing what this chart shows'),
      }),
      execute: async ({ sql, title, chartType, x, y, explanation }) => {
        try {
          const data = await runSql(sessionId, sql)
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
        } catch (e) {
          return { sql, title, chartType, x, y, explanation, error: (e as Error).message }
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
- mentions a table name (e.g. gold_customer_stats, mizumi.default.xxx)
- asks for top N, counts, sums, averages, trends, comparisons, rankings
- asks to visualize, plot, chart, or graph anything

## WHEN NOT TO CALL A TOOL:
- purely conversational messages ("thanks", "what is Mizumi?")
- questions about the schema you can answer from the list below

## SQL rules:
- Always use fully qualified names: mizumi.default.<table>
- If the user provides a fully qualified name, use it verbatim

## Error handling:
- If a tool returns an error field, quote it exactly and STOP.
- If the result is empty (0 rows), say so and STOP.

## Available tables in mizumi.default:
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
