"use client";

import { type EventOption, EventPublisher } from "@/components/event-publisher";
import { useEffect, useState } from "react";

function uuid() {
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function recentTimestamp(maxDaysAgo = 30): string {
  const ms = Date.now() - randInt(0, maxDaysAgo * 24 * 60 * 60 * 1000);
  return new Date(ms).toISOString();
}

type HdbankCustomer = {
  hdbank_customer_id: string;
};

const MERCHANTS = [
  {
    name: "VIETJETAIR",
    category: "AIRLINE",
    currency: "VND",
    minAmt: 1_200_000,
    maxAmt: 9_800_000,
    noteTemplate: "Travel payment with strong airline affinity",
  },
  {
    name: "BOOKING.COM",
    category: "TRAVEL",
    currency: "USD",
    minAmt: 45,
    maxAmt: 420,
    noteTemplate: "Hotel booking before summer travel",
  },
  {
    name: "AIRBNB",
    category: "TRAVEL",
    currency: "USD",
    minAmt: 60,
    maxAmt: 550,
    noteTemplate: "Travel lodging payment",
  },
  {
    name: "COOPMART",
    category: "GROCERY",
    currency: "VND",
    minAmt: 150_000,
    maxAmt: 1_500_000,
    noteTemplate: "Everyday spend",
  },
  {
    name: "HIGHLANDS",
    category: "DINING",
    currency: "VND",
    minAmt: 45_000,
    maxAmt: 250_000,
    noteTemplate: "Daily lifestyle payment",
  },
];

function generatePaymentEvent(customers: HdbankCustomer[]) {
  const customer = pick(customers);
  const accountId = `ACC-${customer.hdbank_customer_id.slice(-4)}`;
  const merchant = pick(MERCHANTS);
  const txSuffix = uuid().replace(/-/g, "").slice(0, 12).toUpperCase();

  return {
    payment_event_id: uuid(),
    customer_id: customer.hdbank_customer_id,
    account_id: accountId,
    transaction_reference: `TXN-${txSuffix}`,
    merchant_name: merchant.name,
    merchant_category: merchant.category,
    amount: randFloat(
      merchant.minAmt,
      merchant.maxAmt,
      merchant.currency === "USD" ? 2 : 0,
    ),
    currency: merchant.currency,
    payment_timestamp: recentTimestamp(7),
    note: `${merchant.noteTemplate} via HDBank card`,
  };
}

export default function HdbankPage() {
  const [customers, setCustomers] = useState<HdbankCustomer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetch("/api/demo/customers?company=hdbank")
      .then((response) => response.json())
      .then((payload: { customers: HdbankCustomer[] }) => {
        if (mounted) {
          setCustomers(payload.customers);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setCustomers([]);
          setLoaded(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading HDBank customer master…
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No HDBank customers found in the shared customer master.
      </div>
    );
  }

  const hdbankOptions: EventOption[] = [
    {
      id: "payment",
      label: "Card Transaction Event",
      endpoint: "/api/tests/hdbank/payment-events",
      createSample: () => generatePaymentEvent(customers),
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <EventPublisher
        title="HDBank Transfer"
        subtitle="Customer profiles come from the shared CSV master. Send 100 HDBank payment events for the VietJet co-brand journey."
        options={hdbankOptions}
      />
    </div>
  );
}
