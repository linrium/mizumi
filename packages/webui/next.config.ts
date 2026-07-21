import type { NextConfig } from "next"

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "http://controlplane-svc.controlplane.svc.cluster.local:4000"
    : "http://localhost:4000"

const API_BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  reactCompiler: true,
  async rewrites() {
    return [
      {
        destination: `${API_BASE_URL}/api/lineage/:path*`,
        source: "/api/lineage/:path*",
      },
      {
        destination: `${API_BASE_URL}/dagster/:path*`,
        source: "/api/dagster/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/sessions/:path*`,
        source: "/api/sessions/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/query`,
        source: "/api/query",
      },
      {
        destination: `${API_BASE_URL}/api/streaming/:path*`,
        source: "/api/streaming/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/tests/:path*`,
        source: "/api/tests/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/permissions/:path*`,
        source: "/api/permissions/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/teams/:path*`,
        source: "/api/teams/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/teams`,
        source: "/api/teams",
      },
      {
        destination: `${API_BASE_URL}/api/users/:path*`,
        source: "/api/users/:path*",
      },
      {
        destination: `${API_BASE_URL}/api/users`,
        source: "/api/users",
      },
    ]
  },
}

export default nextConfig
