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

const chartTypeEnum = z.enum(['bar', 'line', 'area', 'pie', 'scatter'])

// Serialisable panel summary sent from the client so the AI can resolve targets
export type PanelSummary = {
  id: string
  title: string
  chartType: string
  sql: string
  xCol: string
  yCol: string
}

export async function POST(req: NextRequest) {
  const { messages, sessionId, modelId, panels, selectedPanelId, lastCreatedIds } = await req.json() as {
    messages: unknown
    sessionId: string | null
    modelId: ModelId
    panels: PanelSummary[]
    selectedPanelId: string | null
    lastCreatedIds: string[]
  }

  const model = resolveModel(modelId ?? 'gpt-5.4-mini')
  const schema = await fetchSchema().catch(() => '(schema unavailable)')

  // Build a concise panel list for the system prompt
  const panelList = (panels ?? []).length > 0
    ? (panels ?? []).map((p) => `  id=${p.id} title="${p.title}" chartType=${p.chartType} xCol=${p.xCol} yCol=${p.yCol}`).join('\n')
    : '  (none)'

  const contextHints = [
    selectedPanelId ? `Selected panel id: ${selectedPanelId}` : null,
    lastCreatedIds?.length ? `Last created panel ids: ${lastCreatedIds.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const tools = {
    createPanel: tool({
      description:
        'Create a new dashboard panel with a chart. Call once per distinct metric or visualization the user asks for.',
      inputSchema: z.object({
        title: z.string().describe('Short panel title'),
        sql: z.string().describe('SQL query. Always use fully qualified names: mizumi.default.<table>'),
        chartType: chartTypeEnum.describe('bar → categories, line/area → time-series, pie → proportions ≤8 slices, scatter → correlation'),
        xCol: z.string().describe('Column for x-axis labels or pie slice names'),
        yCol: z.string().describe('Column for numeric values'),
        explanation: z.string().describe('One sentence describing what this panel shows'),
        width: z.number().int().min(3).max(12).default(6).describe('Width in 12-col grid units'),
        height: z.number().int().min(3).max(8).default(4).describe('Height in grid row units'),
      }),
      execute: async ({ sql, title, chartType, xCol, yCol, explanation, width, height }) => {
        try {
          const data = await runSql(sessionId, sql)
          return { title, sql, chartType, xCol, yCol, explanation, width, height, columns: data.columns, rows: data.rows, row_count: data.row_count }
        } catch (e) {
          return { title, sql, chartType, xCol, yCol, explanation, width, height, error: (e as Error).message }
        }
      },
    }),

    editPanel: tool({
      description:
        'Edit an existing dashboard panel. Use this when the user asks to change, update, fix, rename, or modify a panel. ' +
        'To identify the target: use selectedPanelId when the user says "this panel" or "the selected one"; ' +
        'use lastCreatedIds when the user says "the last one" or "those panels"; ' +
        'otherwise match by title from the panels list. ' +
        'Only include fields that need to change — omit unchanged ones.',
      inputSchema: z.object({
        panelId: z.string().describe('The id of the panel to edit, from the current panels list'),
        title: z.string().optional().describe('New title (omit to keep existing)'),
        sql: z.string().optional().describe('New SQL query (omit to keep existing). Always use mizumi.default.<table>'),
        chartType: chartTypeEnum.optional().describe('New chart type (omit to keep existing)'),
        xCol: z.string().optional().describe('New x-axis column (omit to keep existing)'),
        yCol: z.string().optional().describe('New y-axis column (omit to keep existing)'),
        explanation: z.string().describe('One sentence describing what changed'),
      }),
      execute: async ({ panelId, title, sql, chartType, xCol, yCol, explanation }) => {
        const target = (panels ?? []).find((p) => p.id === panelId)
        if (!target) return { panelId, error: `Panel id "${panelId}" not found` }

        const effectiveSql = sql ?? target.sql
        try {
          const data = await runSql(sessionId, effectiveSql)
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
        } catch (e) {
          return { panelId, title: title ?? target.title, sql: effectiveSql, chartType: chartType ?? target.chartType, xCol: xCol ?? target.xCol, yCol: yCol ?? target.yCol, explanation, error: (e as Error).message }
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

${contextHints ? `## Context:\n${contextHints}` : ''}

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
- Always fully qualify: mizumi.default.<table>
- For time-series: ORDER BY the date/time column ascending

## Chart types:
- bar: categories/comparisons  · line/area: time-series trends  · pie: proportions ≤8 slices  · scatter: correlation

## Available tables in mizumi.default:
${schema}

## On error:
If a tool returns an error field, quote it briefly and stop.`,
    messages: await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0], { tools }),
    tools,
    stopWhen: stepCountIs(15),
  })

  return result.toUIMessageStreamResponse()
}
