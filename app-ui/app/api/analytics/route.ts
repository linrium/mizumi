import { deepseek } from '@ai-sdk/deepseek'
import { generateText, Output } from 'ai'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const UC_BASE = process.env.UC_BASE_URL ?? 'http://localhost:8082/api/2.1/unity-catalog'

type ColumnInfo = { name: string; type_text: string }
type TableDetail = { name: string; columns: ColumnInfo[] }

async function fetchSchema(): Promise<string> {
  const tablesRes = await fetch(
    `${UC_BASE}/tables?catalog_name=mizumi&schema_name=default&max_results=100`,
    { cache: 'no-store' },
  )
  if (!tablesRes.ok) throw new Error('Failed to fetch tables')
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
      return `-- mizumi.default.${t!.name}\n${cols}`
    })
    .join('\n\n')
}

const analyticsSchema = z.object({
  sql: z.string(),
  chart: z.object({
    type: z.enum(['bar', 'line', 'pie', 'table']),
    x: z.string(),
    y: z.string(),
  }),
  explanation: z.string(),
})

export type AnalyticsResponse = z.infer<typeof analyticsSchema>

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question?.trim()) {
    return Response.json({ error: 'question is required' }, { status: 400 })
  }

  let schemaContext: string
  try {
    schemaContext = await fetchSchema()
  } catch (e) {
    return Response.json({ error: `Schema fetch failed: ${(e as Error).message}` }, { status: 502 })
  }

  const { output } = await generateText({
    model: deepseek('deepseek-chat'),
    output: Output.object({ schema: analyticsSchema }),
    prompt: `You are a SQL expert for Apache Spark with Unity Catalog (Delta Lake / Iceberg tables).

Schema (catalog: mizumi, schema: default):
${schemaContext}

User question: ${question}

Rules:
- Use fully qualified names: mizumi.default.<table>
- Keep the query focused and efficient
- Choose the best chart type for the data shape:
  * "bar" for categorical comparisons
  * "line" for time-series or sequential data
  * "pie" for part-of-whole with ≤8 slices
  * "table" when the result is tabular/multi-column`,
  })

  return Response.json(output)
}
