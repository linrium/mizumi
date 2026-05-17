import { apiFetch } from "@/lib/api-client"

export type Team = {
  id: string
  name: string
  workspace: string
  created_at: string
  updated_at: string
}

export type TeamMember = {
  team_id: string
  user_id: string
  full_name: string
  email: string
  username: string
  joined_at: string
}

export async function listTeams(): Promise<Team[]> {
  const res = await apiFetch("/api/teams")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.teams
}

export async function listMyTeams(): Promise<Team[]> {
  const res = await apiFetch("/api/users/me/teams")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.teams
}

export async function getTeam(id: string): Promise<Team> {
  const res = await apiFetch(`/api/teams/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createTeam(
  name: string,
  workspace: string,
): Promise<Team> {
  const res = await apiFetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, workspace }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const res = await apiFetch(`/api/teams/${encodeURIComponent(teamId)}/members`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return body.members
}

export async function addTeamMember(
  teamId: string,
  userId: string,
): Promise<TeamMember> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
