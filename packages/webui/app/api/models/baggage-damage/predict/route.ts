import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const baseUrl =
    process.env.BAGGAGE_MODEL_SERVER_BASE_URL ??
    "http://baggage-model-server-svc.webui.svc.cluster.local:8080"

  const form = await req.formData()
  const upstream = await fetch(`${baseUrl}/predict`, {
    method: "POST",
    body: form,
  })

  const contentType = upstream.headers.get("content-type") ?? "application/json"
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": contentType },
  })
}
