import { apiFetch } from "@/lib/api-client"

export interface User {
  created_at: string
  email: string
  full_name: string
  id: string
  roles: string[]
  updated_at: string
  user_type: string
  username: string
}

export async function listUsers(): Promise<User[]> {
  const res = await apiFetch("/api/users")
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.users
}
