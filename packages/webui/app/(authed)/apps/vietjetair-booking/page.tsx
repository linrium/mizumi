"use client"

import { type EventOption, EventPublisher } from "@/components/event-publisher"

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

function futureTimestamp(minHours = 2, maxDays = 60): string {
  const ms =
    Date.now() +
    randInt(minHours * 60 * 60 * 1000, maxDays * 24 * 60 * 60 * 1000)
  return new Date(ms).toISOString()
}

function pnrCode(): string {
  return Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randInt(0, 31)],
  ).join("")
}

// ── Static lookup tables ──────────────────────────────────────────────────────

const CUSTOMERS = [
  {
    id: "cust_8a3f1b2c",
    name: "Tran Gia Bao",
    home_airport: "SGN",
    tier: "SKYJOY_GOLD",
  },
  {
    id: "cust_2e7d4a91",
    name: "Nguyen Thi Mai",
    home_airport: "HAN",
    tier: "SKYJOY_CLASSIC",
  },
  {
    id: "cust_5c0b9f3e",
    name: "Le Van Duc",
    home_airport: "SGN",
    tier: "SKYJOY_SILVER",
  },
  {
    id: "cust_1d6e8c72",
    name: "Pham Thi Lan",
    home_airport: "DAD",
    tier: "SKYJOY_PLATINUM",
  },
  {
    id: "cust_9f4a2b5d",
    name: "Hoang Minh Tuan",
    home_airport: "HAN",
    tier: "SKYJOY_CLASSIC",
  },
  {
    id: "cust_3b7c1e6f",
    name: "Vo Thi Hoa",
    home_airport: "SGN",
    tier: "SKYJOY_SILVER",
  },
  {
    id: "cust_7e2d9a4b",
    name: "Dang Van Khoa",
    home_airport: "SGN",
    tier: "SKYJOY_CLASSIC",
  },
  {
    id: "cust_4f1c8b3a",
    name: "Bui Thi Thu",
    home_airport: "HAN",
    tier: "SKYJOY_GOLD",
  },
  {
    id: "cust_6a9e3d7c",
    name: "Do Quang Vinh",
    home_airport: "DAD",
    tier: "SKYJOY_SILVER",
  },
  {
    id: "cust_0d5b2f8e",
    name: "Ly Thi Kim Anh",
    home_airport: "SGN",
    tier: "SKYJOY_CLASSIC",
  },
]

type Route = {
  route_code: string
  departure_airport: string
  arrival_airport: string
  flight_prefix: string
  duration_minutes: number
  base_price_vnd: number
}

const ROUTES: Route[] = [
  {
    route_code: "SGN-HAN",
    departure_airport: "SGN",
    arrival_airport: "HAN",
    flight_prefix: "VJ1",
    duration_minutes: 130,
    base_price_vnd: 1_200_000,
  },
  {
    route_code: "HAN-SGN",
    departure_airport: "HAN",
    arrival_airport: "SGN",
    flight_prefix: "VJ2",
    duration_minutes: 130,
    base_price_vnd: 1_200_000,
  },
  {
    route_code: "SGN-DAD",
    departure_airport: "SGN",
    arrival_airport: "DAD",
    flight_prefix: "VJ1",
    duration_minutes: 75,
    base_price_vnd: 750_000,
  },
  {
    route_code: "DAD-SGN",
    departure_airport: "DAD",
    arrival_airport: "SGN",
    flight_prefix: "VJ1",
    duration_minutes: 75,
    base_price_vnd: 750_000,
  },
  {
    route_code: "HAN-DAD",
    departure_airport: "HAN",
    arrival_airport: "DAD",
    flight_prefix: "VJ5",
    duration_minutes: 80,
    base_price_vnd: 800_000,
  },
  {
    route_code: "DAD-HAN",
    departure_airport: "DAD",
    arrival_airport: "HAN",
    flight_prefix: "VJ5",
    duration_minutes: 80,
    base_price_vnd: 800_000,
  },
  {
    route_code: "SGN-PQC",
    departure_airport: "SGN",
    arrival_airport: "PQC",
    flight_prefix: "VJ1",
    duration_minutes: 65,
    base_price_vnd: 650_000,
  },
  {
    route_code: "HAN-PQC",
    departure_airport: "HAN",
    arrival_airport: "PQC",
    flight_prefix: "VJ5",
    duration_minutes: 100,
    base_price_vnd: 950_000,
  },
  {
    route_code: "SGN-CXR",
    departure_airport: "SGN",
    arrival_airport: "CXR",
    flight_prefix: "VJ1",
    duration_minutes: 60,
    base_price_vnd: 600_000,
  },
  {
    route_code: "HAN-VCA",
    departure_airport: "HAN",
    arrival_airport: "VCA",
    flight_prefix: "VJ3",
    duration_minutes: 90,
    base_price_vnd: 900_000,
  },
  // International routes
  {
    route_code: "SGN-BKK",
    departure_airport: "SGN",
    arrival_airport: "BKK",
    flight_prefix: "VJ8",
    duration_minutes: 95,
    base_price_vnd: 2_800_000,
  },
  {
    route_code: "SGN-SIN",
    departure_airport: "SGN",
    arrival_airport: "SIN",
    flight_prefix: "VJ8",
    duration_minutes: 110,
    base_price_vnd: 3_200_000,
  },
  {
    route_code: "SGN-KUL",
    departure_airport: "SGN",
    arrival_airport: "KUL",
    flight_prefix: "VJ8",
    duration_minutes: 115,
    base_price_vnd: 3_000_000,
  },
  {
    route_code: "HAN-ICN",
    departure_airport: "HAN",
    arrival_airport: "ICN",
    flight_prefix: "VJ9",
    duration_minutes: 285,
    base_price_vnd: 6_500_000,
  },
  {
    route_code: "SGN-ICN",
    departure_airport: "SGN",
    arrival_airport: "ICN",
    flight_prefix: "VJ9",
    duration_minutes: 305,
    base_price_vnd: 6_800_000,
  },
  {
    route_code: "HAN-NRT",
    departure_airport: "HAN",
    arrival_airport: "NRT",
    flight_prefix: "VJ9",
    duration_minutes: 330,
    base_price_vnd: 7_500_000,
  },
  {
    route_code: "SGN-TPE",
    departure_airport: "SGN",
    arrival_airport: "TPE",
    flight_prefix: "VJ8",
    duration_minutes: 210,
    base_price_vnd: 5_200_000,
  },
  {
    route_code: "HAN-PVG",
    departure_airport: "HAN",
    arrival_airport: "PVG",
    flight_prefix: "VJ9",
    duration_minutes: 175,
    base_price_vnd: 4_800_000,
  },
]

const AIRCRAFT_TYPES = ["A320", "A320neo", "A321", "A321neo", "A321XLR"]

const FARE_CLASSES = ["ECO_SKYBOSS", "ECO_DELUXE", "ECO", "ECO_LITE"]

// ── Generator functions ───────────────────────────────────────────────────────

function generateCustomerEvent() {
  const customer = pick(CUSTOMERS)
  return {
    customer_id: customer.id,
    customer_name: customer.name,
    membership_tier: customer.tier,
    home_airport: customer.home_airport,
    email_opt_in: Math.random() > 0.2,
    updated_at: recentTimestamp(14),
  }
}

function generateFlightEvent() {
  const route = pick(ROUTES)
  const aircraft_type = pick(AIRCRAFT_TYPES)
  const flightNum = randInt(100, 899)
  const departure_time = futureTimestamp(2, 60)
  const arrival_time = new Date(
    new Date(departure_time).getTime() + route.duration_minutes * 60 * 1000,
  ).toISOString()

  return {
    flight_id: uuid(),
    flight_number: `${route.flight_prefix}${flightNum}`,
    route_code: route.route_code,
    departure_airport: route.departure_airport,
    arrival_airport: route.arrival_airport,
    scheduled_departure_time: departure_time,
    scheduled_arrival_time: arrival_time,
    duration_minutes: route.duration_minutes,
    aircraft_type,
    total_seats: aircraft_type.startsWith("A321") ? 230 : 180,
  }
}

function generateBookingEvent() {
  const customer = pick(CUSTOMERS)
  const route = pick(ROUTES)
  const fare_class = pick(FARE_CLASSES)
  const passengers = randInt(1, 4)
  const fare_multiplier: Record<string, number> = {
    ECO_SKYBOSS: 3.5,
    ECO_DELUXE: 2.0,
    ECO: 1.0,
    ECO_LITE: 0.7,
  }
  const unit_price = Math.round(
    route.base_price_vnd * fare_multiplier[fare_class] * randFloat(0.85, 1.4),
  )
  const ticket_amount = unit_price * passengers

  return {
    booking_id: uuid(),
    customer_id: customer.id,
    pnr_code: pnrCode(),
    payment_reference: `pay_${uuid().replace(/-/g, "").slice(0, 10)}`,
    route_code: route.route_code,
    fare_class,
    passengers,
    unit_price_vnd: unit_price,
    ticket_amount_vnd: ticket_amount,
    currency: "VND",
    booking_timestamp: recentTimestamp(7),
  }
}

// ── Event publisher config ────────────────────────────────────────────────────

const vietjetairOptions: EventOption[] = [
  {
    id: "customer",
    label: "Customer Event",
    endpoint: "/api/tests/vietjetair/customer-events",
    createSample: generateCustomerEvent,
  },
  {
    id: "flight",
    label: "Flight Event",
    endpoint: "/api/tests/vietjetair/flight-events",
    createSample: generateFlightEvent,
  },
  {
    id: "booking",
    label: "Booking Event",
    endpoint: "/api/tests/vietjetair/booking-events",
    createSample: generateBookingEvent,
  },
]

export default function VietjetairBookingPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <EventPublisher
        title="VietJet Air Booking"
        subtitle="Publish raw customer, flight, and booking events to the VietJet bronze topics."
        options={vietjetairOptions}
      />
    </div>
  )
}
