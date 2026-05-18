"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api-client"

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

type CartItem = {
  product: Product
  event: Record<string, unknown>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_ADDRESSES = [
  {
    name: "James Carter",
    phone: "+1-555-0101",
    address: "123 Fifth Ave, Manhattan",
    city: "New York",
  },
  {
    name: "Emily Chen",
    phone: "+1-555-0102",
    address: "456 Market St, SoMa",
    city: "San Francisco",
  },
]

const PAYMENT_METHODS = [
  {
    id: "CREDIT_CARD",
    label: "Credit / Debit Card",
    icon: "💳",
    description: "Visa, Mastercard, Amex",
  },
  {
    id: "E_WALLET_APPLE_PAY",
    label: "Apple Pay",
    icon: "🍎",
    description: "Pay with Face ID or Touch ID",
  },
  {
    id: "E_WALLET_PAYPAL",
    label: "PayPal",
    icon: "🔵",
    description: "Fast checkout with PayPal",
  },
  {
    id: "COD",
    label: "Cash on Delivery",
    icon: "💵",
    description: "Pay when you receive",
  },
  {
    id: "BANK_TRANSFER",
    label: "Bank Transfer",
    icon: "🏦",
    description: "Direct bank / wire transfer",
  },
]

const CITIES = [
  "New York",
  "San Francisco",
  "Chicago",
  "Los Angeles",
  "Seattle",
  "Austin",
  "Boston",
  "Miami",
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("New York")
  const [note, setNote] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD")
  const [placing, setPlacing] = useState(false)
  const [ordered, setOrdered] = useState(false)
  const [orderId, setOrderId] = useState("")

  useEffect(() => {
    const raw = localStorage.getItem("ecommerce_cart")
    if (raw) {
      try {
        setCart(JSON.parse(raw) as CartItem)
      } catch {
        // ignore
      }
    }
  }, [])

  function fillSample(idx: number) {
    const s = SAMPLE_ADDRESSES[idx]
    if (!s) return
    setName(s.name)
    setPhone(s.phone)
    setAddress(s.address)
    setCity(s.city)
  }

  const subtotal = (cart?.product.price ?? 0) * quantity
  const shipping = subtotal >= 50 ? 0 : 4.99
  const total = subtotal + shipping

  async function handlePlaceOrder() {
    if (!cart) return
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast.error("Please fill in all required shipping fields")
      return
    }

    setPlacing(true)
    const oid = `ORD${uuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`

    const event = {
      payment_event_id: uuid(),
      order_id: oid,
      customer_name: name,
      customer_phone: phone,
      shipping_address: `${address}, ${city}`,
      note: note || null,
      product_id: cart.product.id,
      product_name: cart.product.name,
      product_category: cart.product.category,
      quantity,
      unit_price: cart.product.price,
      subtotal,
      shipping_fee: shipping,
      total_amount: total,
      currency: "USD",
      payment_method: paymentMethod,
      status: "CONFIRMED",
      platform: "MIZUMI_SHOP",
      payment_timestamp: new Date().toISOString(),
    }

    try {
      const res = await apiFetch("/api/tests/ecommerce/payment-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })

      if (res.ok) {
        setOrderId(oid)
        setOrdered(true)
        localStorage.removeItem("ecommerce_cart")
        toast.success("Order placed successfully!")
      } else {
        toast.error("Failed to send event", {
          description: `HTTP ${res.status}`,
        })
      }
    } catch (err) {
      toast.error("Connection error", { description: (err as Error).message })
    } finally {
      setPlacing(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (ordered) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-6xl">✅</div>
          <h2 className="mb-2 text-2xl font-bold text-gray-800">
            Order Confirmed!
          </h2>
          <p className="mb-1 text-sm text-gray-500">Order ID</p>
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-2 font-mono text-lg font-bold text-slate-700 border border-slate-200">
            {orderId}
          </div>
          <p className="mb-6 text-sm text-gray-500">
            Your order has been confirmed. We will contact you within 30
            minutes.
          </p>
          <Link
            href="/apps/ecommerce"
            className="block rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white text-center transition-colors hover:bg-indigo-700"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    )
  }

  // ── Empty cart ─────────────────────────────────────────────────────────────

  if (!cart) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-5xl">🛒</div>
          <h2 className="mb-2 text-xl font-bold text-gray-800">
            Your cart is empty
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Browse the store and select a product.
          </p>
          <Link
            href="/apps/ecommerce"
            className="inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Back to Store
          </Link>
        </div>
      </div>
    )
  }

  // ── Checkout form ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-100">
      {/* Header */}
      <header className="bg-slate-900 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            href="/apps/ecommerce"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            ← Store
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold text-sm">Checkout</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl gap-4 px-4 py-6 lg:grid lg:grid-cols-[1fr_360px]">
        {/* ── Left: forms ── */}
        <div className="space-y-4">
          {/* Shipping info */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">
                📦 Shipping Information
              </h2>
              <div className="flex gap-2">
                {SAMPLE_ADDRESSES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => fillSample(i)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Sample {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Full Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Phone Number *
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-555-0100"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Delivery Address *
                </label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street number, street name, district"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  City
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
                >
                  {CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Order Note
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Leave at door, call before delivery..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold text-gray-800">💳 Payment Method</h2>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
                    paymentMethod === method.id
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    onChange={() => setPaymentMethod(method.id)}
                    className="accent-indigo-600"
                  />
                  <span className="text-xl">{method.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">
                      {method.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      {method.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: order summary ── */}
        <div className="mt-4 space-y-4 lg:mt-0">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold text-gray-800">🛍️ Order Summary</h2>

            {/* Product */}
            <div className="flex gap-3">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${cart.product.gradient}`}
              >
                <span className="text-2xl">{cart.product.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-medium text-gray-800">
                  {cart.product.name}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {cart.product.category}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {formatUSD(cart.product.price)}
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-600">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-medium">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <hr className="my-4" />

            {/* Price breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatUSD(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span
                  className={
                    shipping === 0 ? "text-emerald-600 font-medium" : ""
                  }
                >
                  {shipping === 0 ? "Free" : formatUSD(shipping)}
                </span>
              </div>
              {shipping === 0 && (
                <div className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                  🎉 Free shipping on orders over $50
                </div>
              )}
            </div>

            <hr className="my-4" />

            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800">Total</span>
              <span className="text-xl font-bold text-slate-900">
                {formatUSD(total)}
              </span>
            </div>
          </div>

          {/* Place order */}
          <button
            onClick={handlePlaceOrder}
            disabled={placing}
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 hover:shadow-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {placing ? "Placing order…" : "Place Order"}
          </button>

          <p className="text-center text-xs text-gray-400">
            By placing your order you agree to the{" "}
            <span className="text-slate-500">Terms of Service</span> of MiZumi
            Shop.
          </p>
        </div>
      </div>
    </div>
  )
}
