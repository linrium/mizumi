"use client"

import type { UIMessage } from "ai"
import { apiFetch } from "@/lib/api-client"

export type ChatThreadSummary = {
  id: string
  title: string
  last_message_preview: string
  message_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export type ChatThread = ChatThreadSummary & {
  messages: UIMessage[]
}

type ChatThreadPayload = {
  title?: string
  messages?: UIMessage[]
}

async function readJsonError(response: Response) {
  const payload = await response.json().catch(() => ({}))
  return (payload as { error?: string }).error ?? `HTTP ${response.status}`
}

export async function listChatThreads(): Promise<ChatThreadSummary[]> {
  const response = await apiFetch("/api/chat/threads")
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
  const payload = (await response.json()) as { threads?: ChatThreadSummary[] }
  return payload.threads ?? []
}

export async function getChatThread(id: string): Promise<ChatThread> {
  const response = await apiFetch(`/api/chat/threads/${encodeURIComponent(id)}`)
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
  return response.json()
}

export async function createChatThread(
  payload: ChatThreadPayload = {},
): Promise<ChatThread> {
  const response = await apiFetch("/api/chat/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
  return response.json()
}

export async function updateChatThread(
  id: string,
  payload: ChatThreadPayload,
): Promise<ChatThread> {
  const response = await apiFetch(
    `/api/chat/threads/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
  return response.json()
}

export async function deleteChatThread(id: string): Promise<void> {
  const response = await apiFetch(
    `/api/chat/threads/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  )
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
}
