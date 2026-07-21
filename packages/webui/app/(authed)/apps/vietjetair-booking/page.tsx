"use client"

import Editor from "@monaco-editor/react"
import {
  IconAlertHexagon,
  IconLoader2,
  IconPlaneTilt,
  IconSend,
  IconWaveSine,
} from "@tabler/icons-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"

interface PaginatedResponse<T> {
  data: T[]
  hasMore: boolean
  limit: number
  offset: number
  total: number
}

interface FlightTicket {
  airline: string
  baggageKg: number
  baseFare: string
  bookingAt: string
  bookingReference: string
  cabinClass: string
  city: string
  currency: string
  departureAt: string
  destinationAirport: string
  distanceKm: number
  flightDurationMinutes: number
  flightNumber: string
  originAirport: string
  passengerCount: number
  returnDepartureAt: string
  status: string
  taxes: string
  ticketId: string
  totalPrice: string
  tripType: string
  userId: string
}

interface FlightIncident {
  airline: string
  baggageTag: string
  bookingReference: string
  city: string
  currency: string
  delayedMinutes: number
  departureDate: string
  destinationAirport: string
  flightNumber: string
  imagePath: string
  incidentType: string
  issueAirport: string
  originAirport: string
  reportChannel: string
  reportedAt: string
  reportId: string
  severity: string
  status: string
  ticketId: string
  vietjetCustomerId: string
}

type SendResult =
  | {
      ok: true
      status: number
      data: {
        sent: number
        accepted: number
        failed: number
        sample: unknown[]
      }
    }
  | { ok: false; status?: number; error: string }

function formatResultBadge(result: SendResult): string {
  if (result.ok) {
    return `${result.status} Accepted`
  }
  return result.status ? `${result.status} Error` : "Error"
}

function toInt(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10)
}

function normalizeFlightTicket(ticket: FlightTicket): Record<string, unknown> {
  return {
    ...ticket,
    baggageKg: toInt(ticket.baggageKg),
    distanceKm: toInt(ticket.distanceKm),
    flightDurationMinutes: toInt(ticket.flightDurationMinutes),
    passengerCount: toInt(ticket.passengerCount),
    returnDepartureAt: ticket.returnDepartureAt || null,
  }
}

function normalizeFlightIncident(
  incident: FlightIncident
): Record<string, unknown> {
  return {
    ...incident,
    delayedMinutes: toInt(incident.delayedMinutes),
  }
}

async function fetchBatch<T>(dataset: string, batchSize: number): Promise<T[]> {
  const response = await fetch(
    `/api/synthetic/${dataset}?limit=${batchSize}&random=true`,
    { cache: "no-store" }
  )
  if (!response.ok) {
    throw new Error(`Failed to load ${dataset}`)
  }
  const payload = (await response.json()) as PaginatedResponse<T>
  return payload.data
}

interface EventPanelProps {
  batchSize?: number
  className?: string
  dataset: string
  endpoint: string
  icon: React.ComponentType<{
    size?: number
    className?: string
    stroke?: number
  }>
  isFirst?: boolean
  label: string
  normalize: (item: unknown) => Record<string, unknown>
}

function EventPanel({
  icon: Icon,
  label,
  dataset,
  endpoint,
  normalize,
  batchSize = 100,
  isFirst = false,
  className = "",
}: EventPanelProps) {
  const [editorValue, setEditorValue] = useState("[]")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  const handleSend = async () => {
    setSending(true)
    setResult(null)

    try {
      const raw = await fetchBatch(dataset, batchSize)
      const batch = raw.map(normalize)
      setEditorValue(JSON.stringify(batch, null, 2))

      const response = await apiFetch(endpoint, {
        body: JSON.stringify(batch),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const body = await response.json().catch(() => null)

      if (response.ok) {
        const accepted = Array.isArray(body) ? body.length : batch.length
        setResult({
          data: {
            accepted,
            failed: Math.max(0, batch.length - accepted),
            sample: Array.isArray(body) ? body.slice(0, 5) : [body],
            sent: batch.length,
          },
          ok: true,
          status: response.status,
        })
      } else {
        setResult({
          error: (body as { error?: string } | null)?.error ?? "Request failed",
          ok: false,
          status: response.status,
        })
      }
    } catch (error) {
      setResult({ error: (error as Error).message, ok: false })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden ${isFirst ? "" : "border-l"} ${className}`}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b bg-muted/20 px-4 py-2.5">
        <Icon className="text-muted-foreground" size={15} stroke={1.5} />
        <span className="font-medium text-sm">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            className="h-7 gap-1.5 px-3 text-[11px]"
            disabled={sending}
            onClick={handleSend}
            size="sm"
          >
            {sending ? (
              <IconLoader2 className="animate-spin" size={11} />
            ) : (
              <IconSend size={11} />
            )}
            {sending ? `Sending ${batchSize}…` : `Send ${batchSize}`}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="json"
          onChange={(v) => {
            setEditorValue(v ?? "")
            setResult(null)
          }}
          options={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            formatOnPaste: true,
            formatOnType: true,
            lineHeight: 1.55,
            lineNumbers: "on",
            minimap: { enabled: false },
            overviewRulerLanes: 0,
            padding: { bottom: 10, top: 10 },
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
          theme="vs"
          value={editorValue}
        />
      </div>

      <div className="h-52 shrink-0 border-t">
        <div className="flex h-8 shrink-0 items-center gap-3 border-b bg-muted/10 px-3">
          <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Response
          </span>
          {result ? (
            <Badge
              className="rounded px-1.5 font-mono text-[10px]"
              variant={result.ok ? "default" : "destructive"}
            >
              {formatResultBadge(result)}
            </Badge>
          ) : null}
        </div>
        <div className="h-[calc(100%-32px)] overflow-auto px-4 py-2">
          {result ? (
            <pre
              className={`whitespace-pre-wrap font-mono text-xs ${
                result.ok ? "text-foreground" : "text-destructive"
              }`}
            >
              {result.ok ? JSON.stringify(result.data, null, 2) : result.error}
            </pre>
          ) : (
            <span className="text-muted-foreground text-xs">
              Send {batchSize} events to see the batch response.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VietjetairBookingPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <IconWaveSine
          className="text-muted-foreground"
          size={15}
          stroke={1.5}
        />
        <div className="min-w-0">
          <div className="font-medium text-sm">VietJet Air Events</div>
          <div className="text-muted-foreground text-xs">
            Flight tickets and incidents are fetched from the synthetic server
            and sent to the batch APIs.
          </div>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 overflow-hidden"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
      >
        <EventPanel
          dataset="flight-tickets"
          endpoint="/api/tests/vietjetair/flight-tickets/batch"
          icon={IconPlaneTilt}
          isFirst
          label="Flight Ticket Events"
          normalize={
            normalizeFlightTicket as (item: unknown) => Record<string, unknown>
          }
        />
        <EventPanel
          dataset="flight-incidents"
          endpoint="/api/tests/vietjetair/flight-incidents/batch"
          icon={IconAlertHexagon}
          label="Flight Incident Events"
          normalize={
            normalizeFlightIncident as (
              item: unknown
            ) => Record<string, unknown>
          }
        />
      </div>
    </div>
  )
}
