type ChronicleRouteContext = {
  params: Promise<{
    path: string[]
  }>
}

const CHRONICLE_BASE_URL =
  process.env.CHRONICLE_API_BASE_URL || "http://localhost:3008"

function upstreamUrl(path: string[], request: Request) {
  const url = new URL(request.url)
  const upstream = new URL(path.join("/"), `${CHRONICLE_BASE_URL}/`)
  upstream.search = url.search
  return upstream
}

async function proxy(request: Request, context: ChronicleRouteContext) {
  const { path } = await context.params
  const method = request.method
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer()

  const response = await fetch(upstreamUrl(path, request), {
    method,
    body,
    headers: {
      accept: request.headers.get("accept") || "*/*",
      "content-type": request.headers.get("content-type") || "application/json",
    },
    cache: "no-store",
  })

  const headers = new Headers()
  const contentType = response.headers.get("content-type")
  if (contentType) {
    headers.set("content-type", contentType)
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function GET(request: Request, context: ChronicleRouteContext) {
  return proxy(request, context)
}

export async function POST(request: Request, context: ChronicleRouteContext) {
  return proxy(request, context)
}
