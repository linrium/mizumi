const UC_BASE =
  process.env.UC_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080/api/2.1/unity-catalog"
    : "http://localhost:8082/api/2.1/unity-catalog")

type CatalogInfo = { name: string }
type SchemaInfo = { name: string; catalog_name: string }
type TableInfo = { name: string; catalog_name: string; schema_name: string }
type ColumnInfo = { name: string; type_text: string }
type TableDetail = {
  name: string
  catalog_name: string
  schema_name: string
  columns: ColumnInfo[]
}

// Fallback schema derived from infra/k8s/unitycatalog/bootstrap-job.yaml.
// Used when Unity Catalog is unreachable so the model always has accurate context.
export const FALLBACK_SCHEMA = `\
TABLE hdbank.hdbank_partnership_prod_bronze.partner_events_v1:
  timestamp timestamp,
  key string,
  event_type string,
  value string

TABLE hdbank.hdbank_partnership_prod_bronze.customers_v1:
  unified_customer_id string,
  customer_id string,
  customer_name string,
  city string,
  age int,
  segment_name string,
  preferred_channel string,
  monthly_income double,
  credit_score int,
  has_credit_card boolean,
  shared_customer boolean,
  seed_timestamp timestamp

TABLE hdbank.hdbank_partnership_prod_silver.customers_v1:
  customer_id string,
  customer_name string,
  segment_name string,
  kyc_status string,
  preferred_channel string,
  monthly_income double,
  credit_score int,
  has_credit_card boolean,
  shared_customer boolean,
  updated_at timestamp

TABLE hdbank.hdbank_partnership_prod_silver.travel_spend_features_v1:
  customer_id string,
  transaction_count int,
  total_card_spend double,
  travel_spend double,
  has_vietjet_spend int,
  last_payment_at timestamp,
  travel_affinity_score double

TABLE hdbank.hdbank_partnership_prod_gold.vietjet_activation_candidates_v1:
  customer_id string,
  customer_name string,
  offer_name string,
  use_case string,
  propensity_score double,
  recommended_channel string,
  signal_value double

TABLE vietjetair.vietjetair_partnership_prod_bronze.partner_events_v1:
  timestamp timestamp,
  key string,
  event_type string,
  value string

TABLE vietjetair.vietjetair_partnership_prod_bronze.customers_v1:
  unified_customer_id string,
  customer_id string,
  customer_name string,
  city string,
  age int,
  membership_tier string,
  home_airport string,
  email_opt_in boolean,
  shared_customer boolean,
  seed_timestamp timestamp

TABLE vietjetair.vietjetair_partnership_prod_silver.customers_v1:
  customer_id string,
  customer_name string,
  membership_tier string,
  home_airport string,
  email_opt_in boolean,
  shared_customer boolean,
  updated_at timestamp

TABLE vietjetair.vietjetair_partnership_prod_silver.booking_features_v1:
  customer_id string,
  booking_count int,
  gross_booking_value double,
  avg_booking_value double,
  last_booking_at timestamp,
  frequent_flyer_score double

TABLE vietjetair.vietjetair_partnership_prod_gold.hdbank_finance_candidates_v1:
  customer_id string,
  customer_name string,
  offer_name string,
  use_case string,
  propensity_score double,
  recommended_channel string,
  signal_value double

TABLE partnership.co_brand_gold.co_brand_offer_audience_v1:
  customer_id string,
  customer_name string,
  offer_name string,
  use_case string,
  propensity_score double,
  recommended_channel string,
  signal_value double,
  source_company string,
  target_company string,
  priority_band string

TABLE partnership.co_brand_gold.campaign_summary_v1:
  campaign_name string,
  source_company string,
  target_company string,
  offer_name string,
  customer_count int,
  avg_propensity_score double,
  total_signal_value double`

async function ucGet<T>(path: string, token?: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${UC_BASE}${path}`, {
      cache: "no-store",
      headers,
    })
    if (!res.ok) {
      return null
    }
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

type StaticCol = { name: string; type: string; description: string }
type StaticTable = { name: string; comment: string; columns: StaticCol[] }
type StaticSchema = { name: string; comment: string; tables: StaticTable[] }
type StaticCatalog = { name: string; comment: string; schemas: StaticSchema[] }

const STATIC_CATALOGS: StaticCatalog[] = [
  {
    name: "hdbank",
    comment: "HDBank demo catalog for co-branded travel card and ticket financing.",
    schemas: [
      {
        name: "hdbank_partnership_prod_bronze",
        comment: "Raw HDBank partner events from the single company topic.",
        tables: [
          {
            name: "partner_events_v1",
            comment: "Mixed HDBank customer and card transaction events.",
            columns: [
              { name: "timestamp", type: "timestamp", description: "Kafka message ingestion timestamp" },
              { name: "key", type: "string", description: "Kafka partition key identifying the customer or entity" },
              { name: "event_type", type: "string", description: "Event discriminator, e.g. card_transaction, customer_update, credit_check" },
              { name: "value", type: "string", description: "JSON-encoded payload of the event" },
            ],
          },
          {
            name: "customers_v1",
            comment: "Seeded HDBank customer master rows for the partnership demo.",
            columns: [
              { name: "unified_customer_id", type: "string", description: "Cross-company identifier linking HDBank and VietJet customer records" },
              { name: "customer_id", type: "string", description: "HDBank internal customer identifier" },
              { name: "customer_name", type: "string", description: "Full name of the HDBank customer" },
              { name: "city", type: "string", description: "City of residence" },
              { name: "age", type: "int", description: "Customer age in years" },
              { name: "segment_name", type: "string", description: "HDBank customer segment, e.g. Mass, Affluent, Premier" },
              { name: "preferred_channel", type: "string", description: "Preferred contact channel, e.g. mobile, branch, email" },
              { name: "monthly_income", type: "double", description: "Declared or estimated monthly income in VND" },
              { name: "credit_score", type: "int", description: "HDBank internal credit score" },
              { name: "has_credit_card", type: "boolean", description: "Whether the customer holds an active HDBank credit card" },
              { name: "shared_customer", type: "boolean", description: "Whether this customer record is also shared with VietJet" },
              { name: "seed_timestamp", type: "timestamp", description: "Timestamp when the seed record was loaded into the bronze layer" },
            ],
          },
        ],
      },
      {
        name: "hdbank_partnership_prod_silver",
        comment: "HDBank customer and travel-affinity features.",
        tables: [
          {
            name: "customers_v1",
            comment: "Latest HDBank customer profiles for cross-sell analysis.",
            columns: [
              { name: "customer_id", type: "string", description: "HDBank internal customer identifier" },
              { name: "customer_name", type: "string", description: "Full name of the customer" },
              { name: "segment_name", type: "string", description: "HDBank customer segment, e.g. Mass, Affluent, Premier" },
              { name: "kyc_status", type: "string", description: "KYC verification status, e.g. verified, pending, rejected" },
              { name: "preferred_channel", type: "string", description: "Preferred contact channel, e.g. mobile, branch, email" },
              { name: "monthly_income", type: "double", description: "Monthly income in VND" },
              { name: "credit_score", type: "int", description: "HDBank internal credit score" },
              { name: "has_credit_card", type: "boolean", description: "Active HDBank credit card flag" },
              { name: "shared_customer", type: "boolean", description: "Whether this customer is also known to VietJet" },
              { name: "updated_at", type: "timestamp", description: "Timestamp of the most recent profile update" },
            ],
          },
          {
            name: "travel_spend_features_v1",
            comment: "Travel affinity features from HDBank card transactions.",
            columns: [
              { name: "customer_id", type: "string", description: "HDBank customer identifier" },
              { name: "transaction_count", type: "int", description: "Total number of card transactions observed" },
              { name: "total_card_spend", type: "double", description: "Total card spend across all merchants in VND" },
              { name: "travel_spend", type: "double", description: "Spend on travel-related merchants in VND" },
              { name: "has_vietjet_spend", type: "int", description: "1 if the customer has any VietJet-related card spend, 0 otherwise" },
              { name: "last_payment_at", type: "timestamp", description: "Timestamp of the most recent card payment" },
              { name: "travel_affinity_score", type: "double", description: "Derived score (0–1) indicating likelihood of VietJet conversion based on travel spend patterns" },
            ],
          },
        ],
      },
      {
        name: "hdbank_partnership_prod_gold",
        comment: "HDBank outbound activation targets for VietJet.",
        tables: [
          {
            name: "vietjet_activation_candidates_v1",
            comment: "HDBank customers most likely to convert into VietJet flyers.",
            columns: [
              { name: "customer_id", type: "string", description: "HDBank customer identifier" },
              { name: "customer_name", type: "string", description: "Customer full name" },
              { name: "offer_name", type: "string", description: "Co-brand offer name being recommended, e.g. vietjet_co_brand_card" },
              { name: "use_case", type: "string", description: "Business use case driving the recommendation, e.g. co_brand_travel_card" },
              { name: "propensity_score", type: "double", description: "Model-derived propensity score (0–1); higher means more likely to convert" },
              { name: "recommended_channel", type: "string", description: "Best contact channel for activating this customer" },
              { name: "signal_value", type: "double", description: "Aggregate monetary signal (VND) driving the recommendation" },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "vietjetair",
    comment: "VietJet Air demo catalog for HDBank travel financing cross-sell.",
    schemas: [
      {
        name: "vietjetair_partnership_prod_bronze",
        comment: "Raw VietJet partner events from the single company topic.",
        tables: [
          {
            name: "partner_events_v1",
            comment: "Mixed VietJet customer and booking events.",
            columns: [
              { name: "timestamp", type: "timestamp", description: "Kafka message ingestion timestamp" },
              { name: "key", type: "string", description: "Kafka partition key identifying the customer or booking" },
              { name: "event_type", type: "string", description: "Event discriminator, e.g. booking, cancellation, customer_update" },
              { name: "value", type: "string", description: "JSON-encoded payload of the event" },
            ],
          },
          {
            name: "customers_v1",
            comment: "Seeded VietJet customer master rows for the partnership demo.",
            columns: [
              { name: "unified_customer_id", type: "string", description: "Cross-company identifier linking VietJet and HDBank customer records" },
              { name: "customer_id", type: "string", description: "VietJet internal customer identifier" },
              { name: "customer_name", type: "string", description: "Full name of the VietJet customer" },
              { name: "city", type: "string", description: "City of residence" },
              { name: "age", type: "int", description: "Customer age in years" },
              { name: "membership_tier", type: "string", description: "VietJet loyalty program tier, e.g. Sky Boss, SkyJoy Silver, SkyJoy Gold" },
              { name: "home_airport", type: "string", description: "Primary departure airport IATA code, e.g. SGN, HAN" },
              { name: "email_opt_in", type: "boolean", description: "Whether the customer has opted into email marketing" },
              { name: "shared_customer", type: "boolean", description: "Whether this customer record is also shared with HDBank" },
              { name: "seed_timestamp", type: "timestamp", description: "Timestamp when the seed record was loaded into the bronze layer" },
            ],
          },
        ],
      },
      {
        name: "vietjetair_partnership_prod_silver",
        comment: "VietJet customer and booking features.",
        tables: [
          {
            name: "customers_v1",
            comment: "Latest VietJet customer profiles for cross-sell analysis.",
            columns: [
              { name: "customer_id", type: "string", description: "VietJet internal customer identifier" },
              { name: "customer_name", type: "string", description: "Full name of the customer" },
              { name: "membership_tier", type: "string", description: "VietJet loyalty tier" },
              { name: "home_airport", type: "string", description: "Primary departure airport IATA code" },
              { name: "email_opt_in", type: "boolean", description: "Email marketing opt-in flag" },
              { name: "shared_customer", type: "boolean", description: "Whether this customer is also known to HDBank" },
              { name: "updated_at", type: "timestamp", description: "Timestamp of the most recent profile update" },
            ],
          },
          {
            name: "booking_features_v1",
            comment: "Booking intensity features for HDBank finance targeting.",
            columns: [
              { name: "customer_id", type: "string", description: "VietJet customer identifier" },
              { name: "booking_count", type: "int", description: "Total number of VietJet flight bookings" },
              { name: "gross_booking_value", type: "double", description: "Total value of all bookings in VND" },
              { name: "avg_booking_value", type: "double", description: "Average booking value per trip in VND" },
              { name: "last_booking_at", type: "timestamp", description: "Timestamp of the most recent booking" },
              { name: "frequent_flyer_score", type: "double", description: "Derived score (0–1) measuring booking intensity and recency" },
            ],
          },
        ],
      },
      {
        name: "vietjetair_partnership_prod_gold",
        comment: "VietJet outbound activation targets for HDBank.",
        tables: [
          {
            name: "hdbank_finance_candidates_v1",
            comment: "VietJet flyers most likely to take HDBank financing or a co-brand card.",
            columns: [
              { name: "customer_id", type: "string", description: "VietJet customer identifier" },
              { name: "customer_name", type: "string", description: "Customer full name" },
              { name: "offer_name", type: "string", description: "Financing or co-brand offer name, e.g. hdbank_ticket_financing" },
              { name: "use_case", type: "string", description: "Business use case, e.g. ticket_financing, co_brand_card" },
              { name: "propensity_score", type: "double", description: "Model-derived propensity score (0–1)" },
              { name: "recommended_channel", type: "string", description: "Best contact channel for activating this customer" },
              { name: "signal_value", type: "double", description: "Aggregate monetary signal driving the recommendation" },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "partnership",
    comment: "Shared partnership outputs for co-brand campaign planning.",
    schemas: [
      {
        name: "co_brand_gold",
        comment: "Joint campaign audience and summary outputs.",
        tables: [
          {
            name: "co_brand_offer_audience_v1",
            comment: "Unified outbound audience for the co-brand travel use case.",
            columns: [
              { name: "customer_id", type: "string", description: "Unified cross-company customer identifier" },
              { name: "customer_name", type: "string", description: "Customer full name" },
              { name: "offer_name", type: "string", description: "Co-brand offer being promoted" },
              { name: "use_case", type: "string", description: "Business use case driving the audience selection" },
              { name: "propensity_score", type: "double", description: "Propensity score (0–1) for offer acceptance" },
              { name: "recommended_channel", type: "string", description: "Best contact channel for activation" },
              { name: "signal_value", type: "double", description: "Monetary signal value in VND" },
              { name: "source_company", type: "string", description: "Company that contributed this customer (hdbank or vietjetair)" },
              { name: "target_company", type: "string", description: "Company that will activate the offer" },
              { name: "priority_band", type: "string", description: "Campaign priority tier: high, medium, or low" },
            ],
          },
          {
            name: "campaign_summary_v1",
            comment: "Compact campaign summary for activation planning.",
            columns: [
              { name: "campaign_name", type: "string", description: "Unique campaign identifier" },
              { name: "source_company", type: "string", description: "Company contributing the audience" },
              { name: "target_company", type: "string", description: "Company activating the offer" },
              { name: "offer_name", type: "string", description: "Co-brand offer name" },
              { name: "customer_count", type: "int", description: "Number of customers in the campaign audience" },
              { name: "avg_propensity_score", type: "double", description: "Average propensity score across the audience" },
              { name: "total_signal_value", type: "double", description: "Sum of signal values for the entire audience in VND" },
            ],
          },
        ],
      },
    ],
  },
]

function formatTableBlock(catalog: string, schema: string, table: StaticTable): string {
  const fqn = `${catalog}.${schema}.${table.name}`
  const cols = table.columns
    .map((c) => `  ${c.name} ${c.type}  -- ${c.description}`)
    .join(",\n")
  return `TABLE ${fqn}:\n  -- ${table.comment}\n${cols}`
}

export type StaticSchemaHit = {
  fqn: string
  catalog: string
  schema_name: string
  table_name: string
  text: string
}

/**
 * Returns structured table entries from STATIC_CATALOGS matching `search`.
 * Same shape as the LanceDB SchemaHit so the two sources can be merged.
 */
export function searchStaticCatalogs(search?: string): StaticSchemaHit[] {
  const q = search?.toLowerCase()
  const hits: StaticSchemaHit[] = []

  for (const catalog of STATIC_CATALOGS) {
    for (const schema of catalog.schemas) {
      for (const table of schema.tables) {
        if (q) {
          const haystack = [
            catalog.name,
            catalog.comment,
            schema.name,
            schema.comment,
            table.name,
            table.comment,
            ...table.columns.map((c) => `${c.name} ${c.description}`),
          ]
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(q)) continue
        }
        const fqn = `${catalog.name}.${schema.name}.${table.name}`
        hits.push({
          fqn,
          catalog: catalog.name,
          schema_name: schema.name,
          table_name: table.name,
          text: formatTableBlock(catalog.name, schema.name, table),
        })
      }
    }
  }

  return hits
}

/**
 * Returns full table schemas from the static catalog definition so the AI can
 * describe what data exists across the entire platform without needing live
 * Unity Catalog access. Filtered by `search` keywords when provided.
 */
export function fetchMatchingSchema(search?: string): string {
  const q = search?.toLowerCase()

  const blocks: string[] = []
  for (const catalog of STATIC_CATALOGS) {
    for (const schema of catalog.schemas) {
      for (const table of schema.tables) {
        if (q) {
          const haystack = [
            catalog.name,
            catalog.comment,
            schema.name,
            schema.comment,
            table.name,
            table.comment,
            ...table.columns.map((c) => `${c.name} ${c.description}`),
          ]
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(q)) continue
        }
        blocks.push(formatTableBlock(catalog.name, schema.name, table))
      }
    }
  }

  if (blocks.length === 0) {
    return `No tables found matching "${search ?? ""}"`
  }
  return blocks.join("\n\n")
}

export async function fetchSchema(token?: string): Promise<string> {
  const catalogsData = await ucGet<{ catalogs: CatalogInfo[] }>(
    "/catalogs?max_results=100",
    token,
  )
  const catalogs = (catalogsData?.catalogs ?? []).filter(
    (c) => c.name !== "unity",
  )
  if (catalogs.length === 0) {
    return FALLBACK_SCHEMA
  }

  const schemasByCatalog = await Promise.all(
    catalogs.map(async (catalog) => {
      const data = await ucGet<{ schemas: SchemaInfo[] }>(
        `/schemas?catalog_name=${catalog.name}&max_results=200`,
        token,
      )
      return (data?.schemas ?? []).filter(
        (schema) => schema.name !== "information_schema",
      )
    }),
  )

  const allSchemas = schemasByCatalog.flat()
  const tablesBySchema = await Promise.all(
    allSchemas.map(async (schema) => {
      const data = await ucGet<{ tables: TableInfo[] }>(
        `/tables?catalog_name=${schema.catalog_name}&schema_name=${schema.name}&max_results=200`,
        token,
      )
      return data?.tables ?? []
    }),
  )

  const details = await Promise.all(
    tablesBySchema
      .flat()
      .map((table) =>
        ucGet<TableDetail>(
          `/tables/${table.catalog_name}.${table.schema_name}.${table.name}`,
          token,
        ),
      ),
  )

  const live = details
    .flatMap((table) => {
      if (!table) return []
      const fqn = `${table.catalog_name}.${table.schema_name}.${table.name}`
      const columns = (table.columns ?? [])
        .map((col) => `  ${col.name} ${col.type_text}`)
        .join(",\n")
      return [`TABLE ${fqn}:\n${columns}`]
    })
    .join("\n\n")

  return live || FALLBACK_SCHEMA
}
