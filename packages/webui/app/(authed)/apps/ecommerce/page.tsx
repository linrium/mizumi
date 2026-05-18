"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api-client"

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}

function pick<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function recentTimestamp(maxDaysAgo = 30): string {
  const ms = Date.now() - randInt(0, maxDaysAgo * 24 * 60 * 60 * 1000)
  return new Date(ms).toISOString()
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function discountPct(price: number, originalPrice: number): number {
  return Math.round(((originalPrice - price) / originalPrice) * 100)
}

// ── Static data ───────────────────────────────────────────────────────────────

type Product = {
  id: string
  name: string
  price: number
  originalPrice: number
  category: string
  rating: number
  sold: number
  gradient: string
  emoji: string
}

const PRODUCTS: Product[] = [
  {
    id: "p001",
    name: "iPhone 15 Pro Max 256GB",
    price: 1299,
    originalPrice: 1499,
    category: "Phones",
    rating: 4.8,
    sold: 1_234,
    gradient: "from-slate-700 to-slate-900",
    emoji: "📱",
  },
  {
    id: "p002",
    name: "Samsung Galaxy S24 Ultra",
    price: 899,
    originalPrice: 1099,
    category: "Phones",
    rating: 4.7,
    sold: 987,
    gradient: "from-blue-700 to-blue-900",
    emoji: "📱",
  },
  {
    id: "p003",
    name: "Sony WH-1000XM5 Headphones",
    price: 279,
    originalPrice: 349,
    category: "Audio",
    rating: 4.9,
    sold: 3_421,
    gradient: "from-zinc-600 to-zinc-800",
    emoji: "🎧",
  },
  {
    id: "p004",
    name: "Apple Watch Series 9 45mm",
    price: 399,
    originalPrice: 449,
    category: "Wearables",
    rating: 4.8,
    sold: 756,
    gradient: "from-rose-500 to-rose-700",
    emoji: "⌚",
  },
  {
    id: "p005",
    name: "MacBook Pro M3 14-inch",
    price: 1799,
    originalPrice: 1999,
    category: "Laptops",
    rating: 4.9,
    sold: 432,
    gradient: "from-gray-600 to-gray-800",
    emoji: "💻",
  },
  {
    id: "p006",
    name: "Nike Air Max 270 – White",
    price: 89,
    originalPrice: 130,
    category: "Footwear",
    rating: 4.6,
    sold: 5_643,
    gradient: "from-sky-400 to-sky-600",
    emoji: "👟",
  },
  {
    id: "p007",
    name: 'Samsonite Laptop Backpack 15.6"',
    price: 65,
    originalPrice: 95,
    category: "Accessories",
    rating: 4.7,
    sold: 2_134,
    gradient: "from-emerald-600 to-emerald-800",
    emoji: "🎒",
  },
  {
    id: "p008",
    name: "Philips Hand Blender HR2118",
    price: 34,
    originalPrice: 49,
    category: "Home",
    rating: 4.5,
    sold: 3_892,
    gradient: "from-sky-500 to-sky-700",
    emoji: "🥤",
  },
  {
    id: "p009",
    name: "Laneige Water Sleeping Mask",
    price: 24,
    originalPrice: 32,
    category: "Beauty",
    rating: 4.8,
    sold: 7_231,
    gradient: "from-pink-400 to-pink-600",
    emoji: "🧴",
  },
  {
    id: "p010",
    name: "Adidas Yoga Mat 6mm",
    price: 18,
    originalPrice: 26,
    category: "Sports",
    rating: 4.6,
    sold: 4_123,
    gradient: "from-teal-500 to-teal-700",
    emoji: "🧘",
  },
  {
    id: "p011",
    name: "DJI Mini 4 Pro Combo",
    price: 759,
    originalPrice: 879,
    category: "Cameras",
    rating: 4.9,
    sold: 321,
    gradient: "from-indigo-600 to-indigo-900",
    emoji: "🚁",
  },
  {
    id: "p012",
    name: "Apple AirPods Pro 2nd Gen",
    price: 199,
    originalPrice: 249,
    category: "Audio",
    rating: 4.8,
    sold: 2_876,
    gradient: "from-gray-300 to-gray-500",
    emoji: "🎵",
  },
]

const CATEGORIES = [
  "All",
  "Phones",
  "Laptops",
  "Audio",
  "Wearables",
  "Footwear",
  "Home",
  "Beauty",
  "Sports",
  "Cameras",
  "Accessories",
]

const CUSTOMERS = [
  {
    id: "cust_ec001",
    name: "James Carter",
    email: "james.carter@email.com",
    phone: "+1-555-0101",
    segment: "REGULAR",
    city: "New York",
    joinDate: "2023-03-15",
  },
  {
    id: "cust_ec002",
    name: "Emily Chen",
    email: "emily.chen@email.com",
    phone: "+1-555-0102",
    segment: "VIP",
    city: "San Francisco",
    joinDate: "2022-08-20",
  },
  {
    id: "cust_ec003",
    name: "Marcus Johnson",
    email: "marcus.j@email.com",
    phone: "+1-555-0103",
    segment: "REGULAR",
    city: "Chicago",
    joinDate: "2024-01-10",
  },
  {
    id: "cust_ec004",
    name: "Sofia Martinez",
    email: "sofia.m@email.com",
    phone: "+1-555-0104",
    segment: "PREMIUM",
    city: "Los Angeles",
    joinDate: "2021-11-05",
  },
  {
    id: "cust_ec005",
    name: "David Kim",
    email: "david.kim@email.com",
    phone: "+1-555-0105",
    segment: "VIP",
    city: "Seattle",
    joinDate: "2020-06-18",
  },
  {
    id: "cust_ec006",
    name: "Olivia Brown",
    email: "olivia.b@email.com",
    phone: "+1-555-0106",
    segment: "REGULAR",
    city: "Austin",
    joinDate: "2023-07-22",
  },
]

const PAYMENT_METHODS = [
  "CREDIT_CARD",
  "E_WALLET_APPLE_PAY",
  "E_WALLET_PAYPAL",
  "COD",
  "BANK_TRANSFER",
] as const
const ORDER_STATUSES = ["CONFIRMED", "PROCESSING"] as const

// ── Event generators ──────────────────────────────────────────────────────────

function generatePaymentEvent(product: Product) {
  const customer = pick(CUSTOMERS)
  return {
    payment_event_id: uuid(),
    order_id: `ORD${uuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    customer_id: customer.id,
    customer_name: customer.name,
    product_id: product.id,
    product_name: product.name,
    product_category: product.category,
    quantity: 1,
    unit_price: product.price,
    total_amount: product.price,
    currency: "USD",
    payment_method: pick(PAYMENT_METHODS),
    status: pick(ORDER_STATUSES),
    platform: "MIZUMI_SHOP",
    payment_timestamp: new Date().toISOString(),
  }
}

function generateCustomerEvent(customer: (typeof CUSTOMERS)[0]) {
  return {
    customer_event_id: uuid(),
    customer_id: customer.id,
    customer_name: customer.name,
    email: customer.email,
    phone: customer.phone,
    segment: customer.segment,
    city: customer.city,
    join_date: customer.joinDate,
    last_active: recentTimestamp(30),
    platform: "MIZUMI_SHOP",
    event_type: "PROFILE_UPDATE",
    timestamp: new Date().toISOString(),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EcommercePage() {
  const [activeCategory, setActiveCategory] = useState("All")
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [sendingCustomers, setSendingCustomers] = useState(false)

  const filtered =
    activeCategory === "All"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeCategory)

  async function handleBuy(product: Product) {
    if (buyingId) return
    setBuyingId(product.id)
    const event = generatePaymentEvent(product)

    try {
      const res = await apiFetch("/api/tests/ecommerce/payment-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })

      if (res.ok) {
        toast.success("Order placed!", { description: product.name })
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "ecommerce_cart",
            JSON.stringify({ product, event }),
          )
        }
        setTimeout(() => {
          window.location.href = "/apps/ecommerce/checkout"
        }, 600)
      } else {
        toast.error("Failed to send event", {
          description: `HTTP ${res.status}`,
        })
      }
    } catch (err) {
      toast.error("Connection error", { description: (err as Error).message })
    } finally {
      setBuyingId(null)
    }
  }

  async function handleSendCustomerEvents() {
    if (sendingCustomers) return
    setSendingCustomers(true)

    let succeeded = 0
    let failed = 0

    for (const customer of CUSTOMERS) {
      const event = generateCustomerEvent(customer)
      try {
        const res = await apiFetch("/api/tests/ecommerce/customer-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        })
        if (res.ok) succeeded++
        else failed++
      } catch {
        failed++
      }
    }

    setSendingCustomers(false)

    if (failed === 0) {
      toast.success(`Sent ${succeeded} customer events`)
    } else {
      toast.warning(`${succeeded} sent, ${failed} failed`)
    }
  }

  return (
    <div className="h-full overflow-auto bg-gray-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white font-black text-lg select-none">
                M
              </div>
              <span className="text-white font-bold text-xl tracking-tight hidden sm:block">
                MiZumi Shop
              </span>
            </div>

            {/* Search bar */}
            <div className="flex flex-1 max-w-xl">
              <input
                type="text"
                placeholder="Search products, brands..."
                className="w-full rounded-l-sm px-3 py-2 text-sm outline-none"
              />
              <button className="bg-indigo-600 hover:bg-indigo-700 px-4 rounded-r-sm text-white text-sm font-medium transition-colors">
                Search
              </button>
            </div>

            {/* Actions */}
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <button
                onClick={handleSendCustomerEvents}
                disabled={sendingCustomers}
                className="flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-60 px-3 py-1.5 text-white text-xs font-medium transition-colors border border-white/10"
              >
                <span className="text-base">👥</span>
                {sendingCustomers
                  ? "Sending…"
                  : `Send ${CUSTOMERS.length} Customer Events`}
              </button>
            </div>
          </div>
        </div>

        {/* Category bar */}
        <div className="border-t border-white/5 bg-slate-800/80">
          <div className="mx-auto max-w-7xl px-4">
            <div className="flex gap-1 overflow-x-auto py-2 scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-indigo-500 text-white"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {/* ── Flash sale banner ── */}
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-slate-800 to-indigo-900 px-5 py-4 text-white">
          <span className="text-3xl">⚡</span>
          <div>
            <div className="font-bold text-lg leading-tight">Flash Sale</div>
            <div className="text-sm opacity-80">
              Up to 31% off — Shop before it's gone!
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs opacity-60">Ends in</div>
            <div className="font-mono font-bold text-xl">03:47:22</div>
          </div>
        </div>

        {/* ── Product grid ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((product) => {
            const discount = discountPct(product.price, product.originalPrice)
            const isBuying = buyingId === product.id

            return (
              <div
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Image placeholder */}
                <div
                  className={`relative aspect-square bg-gradient-to-br ${product.gradient} flex items-center justify-center`}
                >
                  <span className="text-5xl select-none">{product.emoji}</span>
                  <div className="absolute top-2 left-2 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    -{discount}%
                  </div>
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <div className="line-clamp-2 text-xs font-medium text-gray-800 leading-tight">
                    {product.name}
                  </div>

                  {/* Price */}
                  <div className="mt-auto">
                    <div className="text-sm font-bold text-slate-800">
                      {formatUSD(product.price)}
                    </div>
                    <div className="text-[11px] text-gray-400 line-through">
                      {formatUSD(product.originalPrice)}
                    </div>
                  </div>

                  {/* Rating + sold */}
                  <div className="flex items-center gap-1 text-[11px] text-gray-500">
                    <span className="text-yellow-400">★</span>
                    <span>{product.rating}</span>
                    <span className="mx-0.5 text-gray-300">|</span>
                    <span>{product.sold.toLocaleString()} sold</span>
                  </div>

                  {/* Buy button */}
                  <button
                    onClick={() => handleBuy(product)}
                    disabled={isBuying || buyingId !== null}
                    className="mt-1 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBuying ? "Processing…" : "Buy Now"}
                  </button>

                  {/* Checkout link */}
                  <Link
                    href="/apps/ecommerce/checkout"
                    className="block text-center text-[11px] text-slate-400 hover:text-slate-600 hover:underline"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.setItem(
                          "ecommerce_cart",
                          JSON.stringify({
                            product,
                            event: generatePaymentEvent(product),
                          }),
                        )
                      }
                    }}
                  >
                    View cart
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="mt-8 border-t bg-white py-6 text-center text-xs text-gray-400">
        © 2025 MiZumi Shop — Simulated e-commerce platform
      </footer>
    </div>
  )
}
