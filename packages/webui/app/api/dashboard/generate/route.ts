import type { NextRequest } from "next/server"
import { handleDashboardGenerate } from "@/services/dashboard"

export async function POST(req: NextRequest) {
  return handleDashboardGenerate(req)
}
