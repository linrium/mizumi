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

const runQueryParameters = z.object({
  sql: z.string().describe('The SQL query to execute'),
  explanation: z.string().describe('One sentence describing what this query returns'),
  visualization: z
    .object({
      type: z.enum(['bar', 'line', 'pie', 'table']),
      x: z.string().describe('Column for x-axis or labels'),
      y: z.string().describe('Column for values'),
    })
    .optional()
    .describe('How to visualize the result. Omit for plain text answers.'),
})

export async function POST(req: NextRequest) {
  const { messages, sessionId, modelId } = await req.json()

  const model = resolveModel((modelId as ModelId) ?? 'gpt-5.4-mini')
  const schema = await fetchSchema().catch(() => '(schema unavailable)')

  const tools = {
    runQuery: tool({
      description:
        'Execute a SQL query and return the results. Call this tool immediately whenever the user asks to see, show, list, fetch, query, or analyze any data — including when they provide a table name directly. Do not narrate what you will do; just call the tool.',
      inputSchema: runQueryParameters,
      execute: async ({ sql, explanation, visualization }) => {
        try {
          const url = sessionId
            ? `${API_BASE}/api/sessions/${sessionId}/query`
            : `${API_BASE}/api/query`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql }),
          })
          const data = await res.json()
          if (!res.ok) return { error: data.error ?? `HTTP ${res.status}`, sql, explanation }
          return {
            sql,
            explanation,
            visualization,
            columns: data.columns as string[],
            rows: data.rows as unknown[][],
            row_count: data.row_count as number,
          }
        } catch (e) {
          const msg = (e as Error).message
          return { error: `Query API unreachable: ${msg}`, sql, explanation }
        }
      },
    }),
  }

  const result = streamText({
    model,
    system: `You are a data analyst for the Mizumi lakehouse platform. You have one tool: runQuery.

## WHEN TO CALL runQuery — call it immediately, without preamble, when the user:
- asks to show, list, display, get, fetch, or query any table or data
- mentions a table name (e.g. gold_customer_stats, mizumi.default.xxx)
- asks for top N, counts, sums, averages, trends, comparisons, or rankings
- pastes or references a SQL query

## WHEN NOT TO CALL runQuery:
- purely conversational messages ("thanks", "what is Mizumi?")
- questions about the schema you can answer from the list below

## SQL rules:
- Always use fully qualified names: mizumi.default.<table>
- If the user provides a fully qualified name, use it verbatim — do NOT change it

## Error handling — IMPORTANT:
- If runQuery returns an error field, quote it exactly and STOP. Do not retry with a different table or query.
- If the result is empty (0 rows), say so and STOP. Do not try other tables.
- Never say "the table may not be accessible" or suggest alternatives on your own.

## Available tables in mizumi.default:
${schema}

## Visualization hints:
- "bar" → categories, "line" → time-series, "pie" → proportions ≤8 slices, "table" → multi-column

## After a successful query — CRITICAL:
- NEVER render data as a markdown table or list. The UI already shows the full results in a data grid.
- Only write 1–2 sentences interpreting the results (e.g. trends, notable values).`,
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
