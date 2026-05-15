import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/services/auth"
export const { GET, POST } = toNextJsHandler(auth.handler)
