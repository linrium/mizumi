import { apiFetch } from "@/lib/api-client"

export type User = {
  id: string
  email: string
  username: string
  full_name: string
  roles: string[]
  user_type: string
  created_at: string
  updated_at: string
}

export async function listUsers(): Promise<User[]> {
  const res = await apiFetch("/api/users")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.users
}
