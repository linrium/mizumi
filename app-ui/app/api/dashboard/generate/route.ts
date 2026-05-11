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

export type ModelId = 'deepseek-chat' | 'gpt-5.4-mini' | 'qwen3.6:27b'

export const MODELS: { id: ModelId; label: string }[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: 'qwen3.6:27b', label: 'Qwen 3.6 27B' },
]

function resolveModel(modelId: ModelId): LanguageModel {
  if (modelId === 'gpt-5.4-mini') return openai('gpt-5.4-mini')
  if (modelId === 'qwen3.6:27b') return ollama('qwen3.6:27b')
  return deepseek('deepseek-chat')
}

// Chart type that maps to dashboard Panel type
const chartTypeEnum = z.enum(['bar', 'line', 'area', 'pie', 'scatter'])

export async function POST(req: NextRequest) {
  const { messages, sessionId, modelId } = await req.json()

  const model = resolveModel((modelId as ModelId) ?? 'gpt-5.4-mini')
  const schema = await fetchSchema().catch(() => '(schema unavailable)')

  const tools = {
    createPanel: tool({
      description:
        'Create a dashboard panel with a chart. Call this once per chart/metric the user asks for. For each distinct question or metric, call this tool separately to create one panel.',
      inputSchema: z.object({
        title: z.string().describe('Short panel title, e.g. "Revenue by Country"'),
        sql: z.string().describe('SQL query whose result feeds this panel. Use fully qualified names: mizumi.default.<table>'),
        chartType: chartTypeEnum.describe('bar → categories/comparisons, line/area → time-series trends, pie → proportions ≤8 slices, scatter → correlation'),
        xCol: z.string().describe('Column name for the x-axis labels or pie slice names'),
        yCol: z.string().describe('Column name for the numeric metric values'),
        explanation: z.string().describe('One sentence describing what this panel shows'),
        width: z.number().int().min(3).max(12).default(6).describe('Panel width in 12-column grid units (3–12). Use 12 for full-width, 6 for half, 4 for third.'),
        height: z.number().int().min(3).max(8).default(4).describe('Panel height in grid row units (3–8).'),
      }),
      execute: async ({ sql, title, chartType, xCol, yCol, explanation, width, height }) => {
        try {
          const data = await runSql(sessionId, sql)
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
        } catch (e) {
          return { title, sql, chartType, xCol, yCol, explanation, width, height, error: (e as Error).message }
        }
      },
    }),
  }

  const result = streamText({
    model,
    system: `You are a data analyst building dashboard panels for the Mizumi lakehouse platform.

## Your job:
When the user asks questions about data, metrics, or trends, respond by calling createPanel once per distinct chart or metric.
For each separate question, metric, or visualization, create a separate panel.

## Tool call rules:
- ALWAYS call createPanel immediately when the user mentions anything about data, metrics, revenue, customers, trends, or asks to visualize anything.
- Call createPanel MULTIPLE TIMES in one response when the user asks for multiple things (e.g. "revenue and customer trends" → 2 panels).
- Do NOT generate markdown tables or lists of data — always use createPanel.
- After all tool calls, write 1–3 sentences summarizing what you created.

## SQL rules:
- Always fully qualify: mizumi.default.<table>
- Limit results appropriately (e.g. TOP/LIMIT for large tables)
- For time-series: ORDER BY the date/time column ascending

## Chart type guidance:
- bar: comparing values across categories (revenue by country, top customers)
- line/area: trends over time (weekly revenue, daily orders)
- pie: proportional breakdown with ≤8 slices (share by segment)
- scatter: correlations between two numeric columns

## Available tables in mizumi.default:
${schema}

## On error:
If createPanel returns an error field, acknowledge it briefly and do not retry.`,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(15),
  })

  return result.toUIMessageStreamResponse()
}
