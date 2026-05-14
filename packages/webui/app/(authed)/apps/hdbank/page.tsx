"use client"

import { type EventOption, EventPublisher } from "@/components/event-publisher"

function uuid() {
  return crypto.randomUUID()
}

const hdbankOptions: EventOption[] = [
  {
    id: "payment",
    label: "Payment Event",
    endpoint: "/api/tests/hdbank/payment-events",
    createSample: () => ({
      payment_event_id: uuid(),
      customer_id: uuid(),
      account_id: uuid(),
      transaction_reference: `txn_${crypto.randomUUID().slice(0, 10)}`,
      merchant_name: "VIETJET AIR",
      merchant_category: "TRAVEL",
      amount: 142.4,
      currency: "USD",
      payment_timestamp: new Date().toISOString(),
      note: "Flight booking paid via HDBank credit card",
    }),
  },
  {
    id: "customer",
    label: "Customer Event",
    endpoint: "/api/tests/hdbank/customer-events",
    createSample: () => ({
      customer_id: uuid(),
      customer_name: "Tran Gia Bao",
      segment_name: "AFFLUENT",
      kyc_status: "VERIFIED",
      preferred_channel: "MOBILE",
      updated_at: new Date().toISOString(),
    }),
  },
]

export default function HdbankPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <EventPublisher
        title="HDBank Events"
        subtitle="Publish raw payment and customer events to the HDBank bronze topics."
        options={hdbankOptions}
      />
    </div>
  )
}
