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

type HdbankCustomer = {
  userId: string
  fullName: string
  city: string
  age: number
  customerCase: string
  customerTier: string
  hdbankAffinityScore: string
  averageMonthlyBalance: string
  creditScoreBand: string
  hdbankSince: string
  hasVietjetCoBrandCard: string
}

type BankingTransaction = {
  transactionId: string
  userId: string
  accountId: string
  postedAt: string
  transactionType: string
  channel: string
  merchantCategory: string
  amount: string
  currency: string
  sourceBank: string
  destinationBank: string
  merchantName: string
  balanceBefore: string
  balanceAfter: string
  city: string
}

function toInt(value: number | string): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10)
}

function normalizeHdbankCustomer(
  customer: HdbankCustomer,
): Record<string, unknown> {
  return {
    ...customer,
    age: toInt(customer.age),
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

export default function HdbankPage() {
  const [customers, setCustomers] = useState<HdbankCustomer[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true

    fetchSyntheticDatasetPage<HdbankCustomer>("hdbank-customers", 500)
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
        Loading HDBank synthetic datasets…
      </div>
    )
  }

  const firstCustomer = customers[0]

  const hdbankOptions: EventOption[] = [
    ...(firstCustomer
      ? [
          {
            id: "customer-profile",
            label: "Customer Profile Events",
            endpoint: "/api/tests/hdbank/customers/batch",
            createSample: () => normalizeHdbankCustomer(firstCustomer),
            createBatch: async (batchSize) =>
              sampleBatch(customers, batchSize).map(normalizeHdbankCustomer),
          } satisfies EventOption,
        ]
      : []),
    {
      id: "banking-transaction",
      label: "Banking Transaction Events",
      endpoint: "/api/tests/hdbank/banking-transactions/batch",
      createBatch: async (batchSize) =>
        (await fetchSyntheticDataset<BankingTransaction>(
          "banking-transactions",
          batchSize,
        )) as Record<string, unknown>[],
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {customers.length === 0 && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          HDBank customer profiles were unavailable from the synthetic server.
          Banking transaction batches are still available.
        </div>
      )}
      <EventPublisher
        title="HDBank Events"
        subtitle={
          customers.length > 0
            ? "Customer profiles and banking transactions are loaded from the synthetic server and sent to the new batch APIs."
            : "Banking transactions are loaded from the synthetic server and sent to the new batch API."
        }
        options={hdbankOptions}
      />
    </div>
  )
}
