"use client"

import { createAuthClient } from "better-auth/react"
import {
  customSessionClient,
  genericOAuthClient,
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), customSessionClient()],
})
