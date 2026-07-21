import { apiFetch } from "@/lib/api-client"

export interface Team {
  created_at: string
  id: string
  name: string
  updated_at: string
  workspace: string
}

export interface TeamMember {
  email: string
  full_name: string
  joined_at: string
  team_id: string
  user_id: string
  username: string
}

export async function listTeams(): Promise<Team[]> {
  const res = await apiFetch("/api/teams")
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.teams
}

export async function listMyTeams(): Promise<Team[]> {
  const res = await apiFetch("/api/users/me/teams")
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.teams
}

export async function getTeam(id: string): Promise<Team> {
  const res = await apiFetch(`/api/teams/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function createTeam(
  name: string,
  workspace: string
): Promise<Team> {
  const res = await apiFetch("/api/teams", {
    body: JSON.stringify({ name, workspace }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const res = await apiFetch(`/api/teams/${encodeURIComponent(teamId)}/members`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.members
}

export async function addTeamMember(
  teamId: string,
  userId: string
): Promise<TeamMember> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/members`,
    {
      body: JSON.stringify({ user_id: userId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<void> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}
