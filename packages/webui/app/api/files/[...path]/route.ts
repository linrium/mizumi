import type { NextRequest } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const base =
    process.env.RUSTFS_S3_URL ??
    "http://rustfs-svc.rustfs.svc.cluster.local:9000"
  const url = `${base}/${path.join("/")}`

  const upstream = await fetch(url)

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status })
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream"
  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    },
  })
}
