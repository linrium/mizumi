"use client"

import { useEffect, useState } from "react"
import { type EventOption, EventPublisher } from "@/components/event-publisher"

type PaginatedResponse<T> = {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

type VietjetairCustomer = {
  userId: string
  fullName: string
  city: string
  age: number
  customerCase: string
  skybossTier: string
  vietjetAirAffinityScore: string
  annualFlights: number
  ancillarySpendScore: string
  vietjetAirSince: string
  hasHdbankCoBrandCard: string
}

type FlightTicket = {
  ticketId: string
  userId: string
  bookingReference: string
  airline: string
  flightNumber: string
  tripType: string
  originAirport: string
  destinationAirport: string
  bookingAt: string
  departureAt: string
  returnDepartureAt: string
  cabinClass: string
  passengerCount: number
  distanceKm: number
  flightDurationMinutes: number
  baseFare: string
  taxes: string
  totalPrice: string
  currency: string
  baggageKg: number
  status: string
  city: string
}

type FlightIncident = {
  reportId: string
  vietjetCustomerId: string
  ticketId: string
  bookingReference: string
  airline: string
  reportChannel: string
  incidentType: string
  severity: string
  issueAirport: string
  originAirport: string
  destinationAirport: string
  flightNumber: string
  departureDate: string
  reportedAt: string
  status: string
  baggageTag: string
  delayedMinutes: number
  currency: string
  city: string
  imagePath: string
}

function toInt(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10)
}

function normalizeVietjetairCustomer(
  customer: VietjetairCustomer,
): Record<string, unknown> {
  return {
    ...customer,
    age: toInt(customer.age),
    annualFlights: toInt(customer.annualFlights),
  }
}

function normalizeFlightTicket(ticket: FlightTicket): Record<string, unknown> {
  return {
    ...ticket,
    passengerCount: toInt(ticket.passengerCount),
    distanceKm: toInt(ticket.distanceKm),
    flightDurationMinutes: toInt(ticket.flightDurationMinutes),
    baggageKg: toInt(ticket.baggageKg),
    returnDepartureAt: ticket.returnDepartureAt || null,
  }
}

function normalizeFlightIncident(
  incident: FlightIncident,
): Record<string, unknown> {
  return {
    ...incident,
    delayedMinutes: toInt(incident.delayedMinutes),
  }
}

async function fetchSyntheticDataset<T>(
  dataset: string,
  limit: number,
  offset = 0,
): Promise<T[]> {
  const response = await fetch(
    `/api/synthetic/${dataset}?limit=${limit}&offset=${offset}`,
    {
      cache: "no-store",
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to load ${dataset}`)
  }

  const payload = (await response.json()) as PaginatedResponse<T>
  return payload.data
}

async function fetchSyntheticDatasetPage<T>(
  dataset: string,
  targetCount: number,
): Promise<T[]> {
  const pageSize = Math.min(100, targetCount)
  const results: T[] = []
  let offset = 0

  while (results.length < targetCount) {
    const page = await fetchSyntheticDataset<T>(dataset, pageSize, offset)
    if (page.length === 0) {
      break
    }

    results.push(...page)

    if (page.length < pageSize) {
      break
    }

    offset += page.length
  }

  return results.slice(0, targetCount)
}

function sampleBatch<T>(items: T[], batchSize: number): T[] {
  if (items.length <= batchSize) {
    return items.slice(0, batchSize)
  }

  const pool = [...items]

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[pool[index], pool[swapIndex]] = [pool[swapIndex] as T, pool[index] as T]
  }

  return pool.slice(0, batchSize)
}

export default function VietjetairBookingPage() {
  const [customers, setCustomers] = useState<VietjetairCustomer[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true

    fetchSyntheticDatasetPage<VietjetairCustomer>("vietjetair-customers", 500)
      .then((data) => {
        if (mounted) {
          setCustomers(data)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (mounted) {
          setCustomers([])
          setLoaded(true)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading VietJet synthetic datasets…
      </div>
    )
  }

  const firstCustomer = customers[0]

  const vietjetairOptions: EventOption[] = [
    ...(firstCustomer
      ? [
          {
            id: "customer-profile",
            label: "Customer Profile Events",
            endpoint: "/api/tests/vietjetair/customers/batch",
            createSample: () => normalizeVietjetairCustomer(firstCustomer),
            createBatch: async (batchSize) =>
              sampleBatch(customers, batchSize).map(
                normalizeVietjetairCustomer,
              ),
          } satisfies EventOption,
        ]
      : []),
    {
      id: "flight-ticket",
      label: "Flight Ticket Events",
      endpoint: "/api/tests/vietjetair/flight-tickets/batch",
      createBatch: async (batchSize) =>
        (
          await fetchSyntheticDataset<FlightTicket>("flight-tickets", batchSize)
        ).map(normalizeFlightTicket),
    },
    {
      id: "flight-incident",
      label: "Flight Incident Events",
      endpoint: "/api/tests/vietjetair/flight-incidents/batch",
      createBatch: async (batchSize) =>
        (
          await fetchSyntheticDataset<FlightIncident>(
            "flight-incidents",
            batchSize,
          )
        ).map(normalizeFlightIncident),
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {customers.length === 0 && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          VietJet customer profiles were unavailable from the synthetic server.
          Flight ticket and incident batches are still available.
        </div>
      )}
      <EventPublisher
        title="VietJet Air Events"
        subtitle={
          customers.length > 0
            ? "Customer profiles, flight tickets, and flight incidents are loaded from the synthetic server and sent to the new batch APIs."
            : "Flight tickets and flight incidents are loaded from the synthetic server and sent to the new batch APIs."
        }
        options={vietjetairOptions}
      />
    </div>
  )
}
