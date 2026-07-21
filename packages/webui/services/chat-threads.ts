"use client"

import type { UIMessage } from "ai"
import { apiFetch } from "@/lib/api-client"

export interface ChatThreadSummary {
  created_at: string
  id: string
  last_message_at: string | null
  last_message_preview: string
  message_count: number
  title: string
  updated_at: string
}

export type ChatThread = ChatThreadSummary & {
  messages: UIMessage[]
}

interface ChatThreadPayload {
  messages?: UIMessage[]
  title?: string
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
  payload: ChatThreadPayload = {}
): Promise<ChatThread> {
  const response = await apiFetch("/api/chat/threads", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
  return response.json()
}

export async function updateChatThread(
  id: string,
  payload: ChatThreadPayload
): Promise<ChatThread> {
  const response = await apiFetch(
    `/api/chat/threads/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }
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
    }
  )
  if (!response.ok) {
    throw new Error(await readJsonError(response))
  }
}
