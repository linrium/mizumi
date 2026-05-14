'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { CpuIcon, Add01Icon, CancelIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSessionContext } from '@/hooks/use-session-context'

export function SessionSelector() {
  const { sessions, activeId, setActiveId, creating, deleting, createSession, deleteSession } = useSessionContext()

  return (
    <div className="flex items-center gap-1">
      {creating ? (
        <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
          Starting…
        </div>
      ) : (
        <>
          {sessions.length > 0 && (
            <Select value={activeId ?? ''} onValueChange={setActiveId}>
              <SelectTrigger className="h-7 w-36 text-xs gap-1.5 px-2">
                <HugeiconsIcon icon={CpuIcon} size={11} className="text-green-500 shrink-0" />
                <SelectValue placeholder="No session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.session_id} value={s.session_id} className="font-mono text-xs">
                    {s.session_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={createSession}
            className="h-7 w-7 text-muted-foreground"
            title="New session"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} />
          </Button>
          {activeId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => deleteSession(activeId)}
              disabled={deleting === activeId}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Kill session"
            >
              <HugeiconsIcon icon={CancelIcon} size={14} />
            </Button>
          )}
        </>
      )}
    </div>
  )
}
