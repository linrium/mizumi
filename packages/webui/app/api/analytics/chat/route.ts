import type { NextRequest } from "next/server"
import { handleAnalyticsChat } from "@/services/analytics"

export async function POST(req: NextRequest) {
  return handleAnalyticsChat(req)
}
