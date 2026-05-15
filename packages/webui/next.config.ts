import type { NextConfig } from "next"

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000"

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    return [
      // dagster routes have no /api/ prefix on the server
      {
        source: "/api/dagster/:path*",
        destination: `${API_BASE_URL}/dagster/:path*`,
      },
      {
        source: "/api/sessions/:path*",
        destination: `${API_BASE_URL}/api/sessions/:path*`,
      },
      {
        source: "/api/query",
        destination: `${API_BASE_URL}/api/query`,
      },
      {
        source: "/api/streaming/:path*",
        destination: `${API_BASE_URL}/api/streaming/:path*`,
      },
      {
        source: "/api/tests/:path*",
        destination: `${API_BASE_URL}/api/tests/:path*`,
      },
    ]
  },
}

export default nextConfig
