const DEFAULT_SYNTHETIC_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "http://synthetic-server-svc.synthetic.svc.cluster.local:8092"
    : "http://127.0.0.1:8092"

const SYNTHETIC_BASE_URL =
  process.env.SYNTHETIC_BASE_URL ?? DEFAULT_SYNTHETIC_BASE_URL

const ALLOWED_DATASETS = new Set([
  "hdbank-customers",
  "vietjetair-customers",
  "banking-transactions",
  "flight-tickets",
  "flight-incidents",
])

type RouteContext = {
  params: Promise<{
    dataset: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const { dataset } = await context.params

  if (!ALLOWED_DATASETS.has(dataset)) {
    return Response.json(
      { error: `Unknown dataset: ${dataset}` },
      { status: 404 },
    )
  }

  const upstreamUrl = new URL(`${SYNTHETIC_BASE_URL}/${dataset}`)
  const incomingUrl = new URL(request.url)
  upstreamUrl.search = incomingUrl.search

  try {
    const response = await fetch(upstreamUrl, {
      cache: "no-store",
    })
    const body = await response.text()

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Synthetic server request failed",
      },
      { status: 502 },
    )
  }
}
