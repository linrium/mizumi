import type { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const baseUrl =
    process.env.BAGGAGE_MODEL_SERVER_BASE_URL ??
    "http://baggage-model-svc.ml.svc.cluster.local:8080"

  const form = await req.formData()
  const upstream = await fetch(`${baseUrl}/predict`, {
    body: form,
    method: "POST",
  })

  const contentType = upstream.headers.get("content-type") ?? "application/json"
  return new Response(upstream.body, {
    headers: { "content-type": contentType },
    status: upstream.status,
  })
}
