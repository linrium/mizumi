"use client"

import { type EventOption, EventPublisher } from "@/components/event-publisher"
import { useEffect, useState } from "react"

function uuid() {
  return crypto.randomUUID()
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randFloat(min: number, max: number, decimals = 0): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function recentTimestamp(maxDaysAgo = 30): string {
  const ms = Date.now() - randInt(0, maxDaysAgo * 24 * 60 * 60 * 1000)
  return new Date(ms).toISOString()
}

function pnrCode(): string {
  return Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randInt(0, 31)],
  ).join("")
}

type VietjetairCustomer = {
  vietjetair_customer_id: string
}

const FALLBACK_CUSTOMERS: VietjetairCustomer[] = [
  { vietjetair_customer_id: "VJ-FALLBACK-0001" },
  { vietjetair_customer_id: "VJ-FALLBACK-0002" },
  { vietjetair_customer_id: "VJ-FALLBACK-0003" },
  { vietjetair_customer_id: "VJ-FALLBACK-0004" },
  { vietjetair_customer_id: "VJ-FALLBACK-0005" },
]

const ROUTES = [
  { route_code: "SGN-HAN", base_price_vnd: 1_200_000 },
  { route_code: "HAN-SGN", base_price_vnd: 1_200_000 },
  { route_code: "SGN-DAD", base_price_vnd: 750_000 },
  { route_code: "DAD-SGN", base_price_vnd: 750_000 },
  { route_code: "SGN-PQC", base_price_vnd: 650_000 },
  { route_code: "SGN-BKK", base_price_vnd: 2_800_000 },
  { route_code: "HAN-ICN", base_price_vnd: 6_500_000 },
  { route_code: "SGN-SIN", base_price_vnd: 3_200_000 },
]

function generateBookingEvent(customers: VietjetairCustomer[]) {
  const customer = pick(customers)
  const route = pick(ROUTES)
  const passengers = randInt(1, 4)

  return {
    booking_id: uuid(),
    customer_id: customer.vietjetair_customer_id,
    pnr_code: pnrCode(),
    payment_reference: `PAYREF-${uuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    route_code: route.route_code,
    ticket_amount: Math.round(
      route.base_price_vnd * passengers * randFloat(0.85, 1.4),
    ),
    currency: "VND",
    booking_timestamp: recentTimestamp(7),
  }
}

export default function VietjetairBookingPage() {
  const [customers, setCustomers] = useState<VietjetairCustomer[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true

    fetch("/api/demo/customers?company=vietjetair")
      .then((response) => response.json())
      .then((payload: { customers: VietjetairCustomer[] }) => {
        if (mounted) {
          setCustomers(payload.customers)
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
        Loading VietJet customer master…
      </div>
    )
  }

  const activeCustomers =
    customers.length > 0 ? customers : FALLBACK_CUSTOMERS

  const vietjetairOptions: EventOption[] = [
    {
      id: "booking",
      label: "Booking Event",
      endpoint: "/api/tests/vietjetair/booking-events",
      createSample: () => generateBookingEvent(activeCustomers),
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {customers.length === 0 && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Shared customer master returned no VietJet rows. Using fallback demo
          customer IDs so you can still send booking events.
        </div>
      )}
      <EventPublisher
        title="VietJet Air Booking"
        subtitle={
          customers.length > 0
            ? "Customer profiles come from the shared CSV master. Send 100 VietJet booking events for HDBank travel financing."
            : "Shared CSV customers were unavailable, so this page is using fallback VietJet demo customer IDs. Send 100 booking events."
        }
        options={vietjetairOptions}
      />
    </div>
  )
}
