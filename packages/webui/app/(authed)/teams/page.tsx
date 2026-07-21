"use client"

import { Add01Icon, UserMultiple02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNowStrict } from "date-fns"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
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
        if (!cancelled) {
          setTeams(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load teams")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate() {
    if (creating) {
      return
    }
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
      <div className="shrink-0 border-b">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <h1 className="font-semibold text-sm">Teams</h1>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Manage teams and their access to platform resources.
            </p>
            {error && <p className="mt-1 text-destructive text-xs">{error}</p>}
          </div>
          <Button onClick={openCreate} size="sm" type="button">
            <HugeiconsIcon icon={Add01Icon} size={14} />
            New team
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
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
                  className="h-24 text-center text-muted-foreground"
                  colSpan={3}
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : teams.length > 0 ? (
              teams.map((team) => (
                <TableRow className="cursor-pointer" key={team.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:underline"
                      href={`/teams/${team.id}`}
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
                  className="h-24 text-center text-muted-foreground"
                  colSpan={3}
                >
                  No teams yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2 text-muted-foreground text-xs">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserMultiple02Icon} size={14} />
          Teams group users for permission assignment and policy templates.
        </div>
        <span>{teams.length} total</span>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || creating)) {
            setCreateOpen(false)
          }
        }}
        open={createOpen}
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
              disabled={creating}
              id="team-name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreate()
                }
              }}
              placeholder="e.g. Data Engineering"
              ref={nameInputRef}
              value={newName}
            />
            <Label htmlFor="team-workspace">Workspace</Label>
            <Input
              disabled={creating}
              id="team-workspace"
              onChange={(e) => setNewWorkspace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreate()
                }
              }}
              placeholder="e.g. vietjetair"
              value={newWorkspace}
            />
            {createError && (
              <p className="text-destructive text-xs">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={creating}
              onClick={() => setCreateOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={creating} onClick={handleCreate} type="button">
              {creating ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
