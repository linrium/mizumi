"use client"

import { Add01Icon, UserMultiple02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createTeam, listTeams, type Team } from "@/services/teams"

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newWorkspace, setNewWorkspace] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await listTeams()
        if (!cancelled) setTeams(data)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load teams")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate() {
    if (creating) return
    const name = newName.trim()
    const workspace = newWorkspace.trim()
    if (!name) {
      setCreateError("Name is required")
      nameInputRef.current?.focus()
      return
    }
    if (!workspace) {
      setCreateError("Workspace is required")
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const team = await createTeam(name, workspace)
      setTeams((prev) =>
        [...prev, team].sort((a, b) => a.name.localeCompare(b.name))
      )
      setCreateOpen(false)
      setNewName("")
      setNewWorkspace("")
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create team"
      )
    } finally {
      setCreating(false)
    }
  }

  function openCreate() {
    setNewName("")
    setNewWorkspace("")
    setCreateError(null)
    setCreateOpen(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b shrink-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Teams</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Manage teams and their access to platform resources.
            </p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <Button type="button" size="sm" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} size={14} />
            New team
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : teams.length > 0 ? (
              teams.map((team) => (
                <TableRow key={team.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link
                      href={`/teams/${team.id}`}
                      className="hover:underline"
                    >
                      {team.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{team.workspace}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(team.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-24 text-center text-muted-foreground"
                >
                  No teams yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserMultiple02Icon} size={14} />
          Teams group users for permission assignment and policy templates.
        </div>
        <span>{teams.length} total</span>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !creating) setCreateOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
            <DialogDescription>
              Add a new team to the platform. Team names must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              ref={nameInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Data Engineering"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
            />
            <Label htmlFor="team-workspace">Workspace</Label>
            <Input
              id="team-workspace"
              value={newWorkspace}
              onChange={(e) => setNewWorkspace(e.target.value)}
              placeholder="e.g. vietjetair"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
            />
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={creating} onClick={handleCreate}>
              {creating ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
