"use client"

import { type EventOption, EventPublisher } from "@/components/event-publisher"

function uuid() {
  return crypto.randomUUID()
}

const vietjetairOptions: EventOption[] = [
  {
    id: "customer",
    label: "Customer Event",
    endpoint: "/api/tests/vietjetair/customer-events",
    createSample: () => ({
      customer_id: uuid(),
      customer_name: "Nguyen Minh Anh",
      membership_tier: "SKYJOY_GOLD",
      home_airport: "SGN",
      email_opt_in: true,
      updated_at: new Date().toISOString(),
    }),
  },
  {
    id: "flight",
    label: "Flight Event",
    endpoint: "/api/tests/vietjetair/flight-events",
    createSample: () => ({
      flight_id: uuid(),
      flight_number: "VJ247",
      route_code: "SGN-HAN",
      departure_airport: "SGN",
      arrival_airport: "HAN",
      scheduled_departure_time: new Date(
        Date.now() + 1000 * 60 * 90,
      ).toISOString(),
      aircraft_type: "A321neo",
    }),
  },
  {
    id: "booking",
    label: "Booking Event",
    endpoint: "/api/tests/vietjetair/booking-events",
    createSample: () => ({
      booking_id: uuid(),
      customer_id: uuid(),
      pnr_code: "Q7M9XZ",
      payment_reference: `pay_${crypto.randomUUID().slice(0, 8)}`,
      route_code: "SGN-DAD",
      ticket_amount: 128.75,
      currency: "USD",
      booking_timestamp: new Date().toISOString(),
    }),
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
