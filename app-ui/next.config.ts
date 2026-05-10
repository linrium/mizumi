import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:6000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
