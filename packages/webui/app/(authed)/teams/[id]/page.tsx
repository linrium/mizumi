"use client"

import {
  Add01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
import Link from "next/link"
import { use, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  addTeamMember,
  getTeam,
  listTeamMembers,
  removeTeamMember,
  type Team,
  type TeamMember,
} from "@/services/teams"
import { listUsers, type User } from "@/services/users"

export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [team, setTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")

  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [teamData, membersData, usersData] = await Promise.all([
          getTeam(id),
          listTeamMembers(id),
          listUsers(),
        ])
        if (!cancelled) {
          setTeam(teamData)
          setMembers(membersData)
          setAllUsers(usersData)
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load team",
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const memberIds = new Set(members.map((m) => m.user_id))
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id))

  function openAdd() {
    setSelectedUserId("")
    setAddError(null)
    setAddOpen(true)
  }

  async function handleAdd() {
    if (adding || !selectedUserId) return
    setAdding(true)
    setAddError(null)
    try {
      const member = await addTeamMember(id, selectedUserId)
      setMembers((prev) =>
        [...prev, member].sort((a, b) =>
          a.full_name.localeCompare(b.full_name),
        ),
      )
      setAddOpen(false)
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Failed to add member",
      )
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(userId: string) {
    if (removingId) return
    setRemovingId(userId)
    try {
      await removeTeamMember(id, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch {
      // surface error inline if needed
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-xs text-destructive">{error ?? "Team not found"}</p>
        <Link href="/teams" className="text-xs text-muted-foreground hover:underline">
          Back to teams
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">{team.name}</h1>
              <div className="mt-1">
                <Badge variant="outline">{team.workspace}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Created{" "}
                {formatDistanceToNowStrict(new Date(team.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={openAdd}
            disabled={availableUsers.length === 0}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} />
            Add member
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length > 0 ? (
              members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell className="font-medium">
                    {member.full_name}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {member.username}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(member.joined_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={removingId === member.user_id}
                      onClick={() => handleRemove(member.user_id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                      <span className="sr-only">Remove member</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No members yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserMultiple02Icon} size={14} />
          Members inherit the team's permissions and policy template eligibility.
        </div>
        <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !adding) setAddOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Add a user to <span className="font-medium">{team.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="member-select">User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="member-select" className="w-full">
                <SelectValue placeholder="Select a user…" />
              </SelectTrigger>
              <SelectContent position="popper">
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                    {user.email ? (
                      <span className="ml-1 text-muted-foreground">
                        ({user.email})
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addError && (
              <p className="text-xs text-destructive">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={adding}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={adding || !selectedUserId}
              onClick={handleAdd}
            >
              {adding ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
