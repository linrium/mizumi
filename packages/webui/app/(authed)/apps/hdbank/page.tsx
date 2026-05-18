"use client"

import { type EventOption, EventPublisher } from "@/components/event-publisher"

function uuid() {
  return crypto.randomUUID()
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function recentTimestamp(maxDaysAgo = 30): string {
  const ms = Date.now() - randInt(0, maxDaysAgo * 24 * 60 * 60 * 1000)
  return new Date(ms).toISOString()
}

// ── Static lookup tables ──────────────────────────────────────────────────────

const CUSTOMERS = [
  { id: "cust_8a3f1b2c", name: "Tran Gia Bao", segment: "AFFLUENT" },
  { id: "cust_2e7d4a91", name: "Nguyen Thi Mai", segment: "MASS" },
  { id: "cust_5c0b9f3e", name: "Le Van Duc", segment: "PREMIUM" },
  { id: "cust_1d6e8c72", name: "Pham Thi Lan", segment: "AFFLUENT" },
  { id: "cust_9f4a2b5d", name: "Hoang Minh Tuan", segment: "MASS" },
  { id: "cust_3b7c1e6f", name: "Vo Thi Hoa", segment: "PREMIUM" },
  { id: "cust_7e2d9a4b", name: "Dang Van Khoa", segment: "MASS" },
  { id: "cust_4f1c8b3a", name: "Bui Thi Thu", segment: "AFFLUENT" },
  { id: "cust_6a9e3d7c", name: "Do Quang Vinh", segment: "PREMIUM" },
  { id: "cust_0d5b2f8e", name: "Ly Thi Kim Anh", segment: "MASS" },
]

const ACCOUNTS: Record<string, string[]> = {
  cust_8a3f1b2c: ["acc_8a3f_001", "acc_8a3f_002"],
  cust_2e7d4a91: ["acc_2e7d_001"],
  cust_5c0b9f3e: ["acc_5c0b_001", "acc_5c0b_002"],
  cust_1d6e8c72: ["acc_1d6e_001"],
  cust_9f4a2b5d: ["acc_9f4a_001", "acc_9f4a_002"],
  cust_3b7c1e6f: ["acc_3b7c_001"],
  cust_7e2d9a4b: ["acc_7e2d_001"],
  cust_4f1c8b3a: ["acc_4f1c_001", "acc_4f1c_002"],
  cust_6a9e3d7c: ["acc_6a9e_001"],
  cust_0d5b2f8e: ["acc_0d5b_001"],
}

type Merchant = {
  name: string
  category: string
  currency: string
  minAmt: number
  maxAmt: number
  noteTemplate: string
}

const MERCHANTS: Merchant[] = [
  {
    name: "VIETJET AIR",
    category: "TRAVEL",
    currency: "VND",
    minAmt: 500_000,
    maxAmt: 8_000_000,
    noteTemplate: "Domestic flight booking",
  },
  {
    name: "VIETNAM AIRLINES",
    category: "TRAVEL",
    currency: "VND",
    minAmt: 1_200_000,
    maxAmt: 15_000_000,
    noteTemplate: "Flight ticket purchase",
  },
  {
    name: "BOOKING.COM",
    category: "TRAVEL",
    currency: "USD",
    minAmt: 45,
    maxAmt: 380,
    noteTemplate: "Hotel reservation",
  },
  {
    name: "GRAB VIETNAM",
    category: "TRANSPORTATION",
    currency: "VND",
    minAmt: 15_000,
    maxAmt: 250_000,
    noteTemplate: "Ride-hailing payment",
  },
  {
    name: "SHOPEE VIETNAM",
    category: "E-COMMERCE",
    currency: "VND",
    minAmt: 50_000,
    maxAmt: 2_500_000,
    noteTemplate: "Online shopping order",
  },
  {
    name: "LAZADA VN",
    category: "E-COMMERCE",
    currency: "VND",
    minAmt: 80_000,
    maxAmt: 3_000_000,
    noteTemplate: "Marketplace purchase",
  },
  {
    name: "TIKI CORP",
    category: "E-COMMERCE",
    currency: "VND",
    minAmt: 60_000,
    maxAmt: 1_800_000,
    noteTemplate: "Online order payment",
  },
  {
    name: "CIRCLE K",
    category: "GROCERY",
    currency: "VND",
    minAmt: 20_000,
    maxAmt: 500_000,
    noteTemplate: "Convenience store purchase",
  },
  {
    name: "WINMART",
    category: "GROCERY",
    currency: "VND",
    minAmt: 100_000,
    maxAmt: 1_200_000,
    noteTemplate: "Supermarket grocery",
  },
  {
    name: "LOTTE MART",
    category: "GROCERY",
    currency: "VND",
    minAmt: 200_000,
    maxAmt: 2_000_000,
    noteTemplate: "Hypermarket shopping",
  },
  {
    name: "MCM HOSPITAL",
    category: "HEALTHCARE",
    currency: "VND",
    minAmt: 200_000,
    maxAmt: 5_000_000,
    noteTemplate: "Medical consultation fee",
  },
  {
    name: "VNPT TELECOM",
    category: "UTILITIES",
    currency: "VND",
    minAmt: 100_000,
    maxAmt: 500_000,
    noteTemplate: "Monthly telecom bill",
  },
  {
    name: "EVN ELECTRICITY",
    category: "UTILITIES",
    currency: "VND",
    minAmt: 150_000,
    maxAmt: 1_500_000,
    noteTemplate: "Electricity bill payment",
  },
  {
    name: "STARBUCKS VN",
    category: "FOOD & BEVERAGE",
    currency: "VND",
    minAmt: 55_000,
    maxAmt: 350_000,
    noteTemplate: "Coffee & beverage",
  },
  {
    name: "PHUC LONG",
    category: "FOOD & BEVERAGE",
    currency: "VND",
    minAmt: 35_000,
    maxAmt: 200_000,
    noteTemplate: "Tea & coffee purchase",
  },
  {
    name: "HIGHLANDS COFFEE",
    category: "FOOD & BEVERAGE",
    currency: "VND",
    minAmt: 45_000,
    maxAmt: 280_000,
    noteTemplate: "Café payment",
  },
  {
    name: "STEAM GAMES",
    category: "ENTERTAINMENT",
    currency: "USD",
    minAmt: 5,
    maxAmt: 60,
    noteTemplate: "Gaming platform purchase",
  },
  {
    name: "NETFLIX VN",
    category: "ENTERTAINMENT",
    currency: "USD",
    minAmt: 7,
    maxAmt: 18,
    noteTemplate: "Streaming subscription",
  },
  {
    name: "FPT UNIVERSITY",
    category: "EDUCATION",
    currency: "VND",
    minAmt: 5_000_000,
    maxAmt: 25_000_000,
    noteTemplate: "Tuition fee payment",
  },
  {
    name: "PARKSON MALL",
    category: "RETAIL",
    currency: "VND",
    minAmt: 300_000,
    maxAmt: 8_000_000,
    noteTemplate: "Department store purchase",
  },
]

const KYC_STATUSES = [
  "VERIFIED",
  "VERIFIED",
  "VERIFIED",
  "PENDING",
  "FAILED",
] as const
const CHANNELS = [
  "MOBILE",
  "MOBILE",
  "INTERNET_BANKING",
  "ATM",
  "BRANCH",
] as const
const TX_STATUSES = ["COMPLETED", "COMPLETED", "COMPLETED", "SETTLED"] as const

// ── Generator functions ───────────────────────────────────────────────────────

function generatePaymentEvent() {
  const customer = pick(CUSTOMERS)
  const accounts = ACCOUNTS[customer.id] ?? [uuid()]
  const account_id = pick(accounts)
  const merchant = pick(MERCHANTS)
  const status = pick(TX_STATUSES)
  const amount = randFloat(
    merchant.minAmt,
    merchant.maxAmt,
    merchant.currency === "USD" ? 2 : 0,
  )
  const txSuffix = uuid().replace(/-/g, "").slice(0, 12).toUpperCase()

  return {
    payment_event_id: uuid(),
    customer_id: customer.id,
    account_id,
    transaction_reference: `TXN${txSuffix}`,
    merchant_name: merchant.name,
    merchant_category: merchant.category,
    amount,
    currency: merchant.currency,
    payment_timestamp: recentTimestamp(7),
    status,
    note: `${merchant.noteTemplate} via HDBank credit card`,
  }
}

function generateCustomerEvent() {
  const customer = pick(CUSTOMERS)
  const kyc_status = pick(KYC_STATUSES)
  const preferred_channel = pick(CHANNELS)

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    segment_name: customer.segment,
    kyc_status,
    preferred_channel,
    updated_at: recentTimestamp(14),
  }
}

// ── Event publisher config ────────────────────────────────────────────────────

const hdbankOptions: EventOption[] = [
  {
    id: "payment",
    label: "Payment Event",
    endpoint: "/api/tests/hdbank/payment-events",
    createSample: generatePaymentEvent,
  },
  {
    id: "customer",
    label: "Customer Event",
    endpoint: "/api/tests/hdbank/customer-events",
    createSample: generateCustomerEvent,
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
