const UC_BASE =
  process.env.UC_BASE_URL ?? "http://localhost:8082/api/2.1/unity-catalog"

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

type StaticCol = { name: string; type: string }
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
              { name: "timestamp", type: "timestamp" },
              { name: "key", type: "string" },
              { name: "event_type", type: "string" },
              { name: "value", type: "string" },
            ],
          },
          {
            name: "customers_v1",
            comment: "Seeded HDBank customer master rows for the partnership demo.",
            columns: [
              { name: "unified_customer_id", type: "string" },
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "city", type: "string" },
              { name: "age", type: "int" },
              { name: "segment_name", type: "string" },
              { name: "preferred_channel", type: "string" },
              { name: "monthly_income", type: "double" },
              { name: "credit_score", type: "int" },
              { name: "has_credit_card", type: "boolean" },
              { name: "shared_customer", type: "boolean" },
              { name: "seed_timestamp", type: "timestamp" },
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
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "segment_name", type: "string" },
              { name: "kyc_status", type: "string" },
              { name: "preferred_channel", type: "string" },
              { name: "monthly_income", type: "double" },
              { name: "credit_score", type: "int" },
              { name: "has_credit_card", type: "boolean" },
              { name: "shared_customer", type: "boolean" },
              { name: "updated_at", type: "timestamp" },
            ],
          },
          {
            name: "travel_spend_features_v1",
            comment: "Travel affinity features from HDBank card transactions.",
            columns: [
              { name: "customer_id", type: "string" },
              { name: "transaction_count", type: "int" },
              { name: "total_card_spend", type: "double" },
              { name: "travel_spend", type: "double" },
              { name: "has_vietjet_spend", type: "int" },
              { name: "last_payment_at", type: "timestamp" },
              { name: "travel_affinity_score", type: "double" },
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
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "offer_name", type: "string" },
              { name: "use_case", type: "string" },
              { name: "propensity_score", type: "double" },
              { name: "recommended_channel", type: "string" },
              { name: "signal_value", type: "double" },
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
              { name: "timestamp", type: "timestamp" },
              { name: "key", type: "string" },
              { name: "event_type", type: "string" },
              { name: "value", type: "string" },
            ],
          },
          {
            name: "customers_v1",
            comment: "Seeded VietJet customer master rows for the partnership demo.",
            columns: [
              { name: "unified_customer_id", type: "string" },
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "city", type: "string" },
              { name: "age", type: "int" },
              { name: "membership_tier", type: "string" },
              { name: "home_airport", type: "string" },
              { name: "email_opt_in", type: "boolean" },
              { name: "shared_customer", type: "boolean" },
              { name: "seed_timestamp", type: "timestamp" },
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
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "membership_tier", type: "string" },
              { name: "home_airport", type: "string" },
              { name: "email_opt_in", type: "boolean" },
              { name: "shared_customer", type: "boolean" },
              { name: "updated_at", type: "timestamp" },
            ],
          },
          {
            name: "booking_features_v1",
            comment: "Booking intensity features for HDBank finance targeting.",
            columns: [
              { name: "customer_id", type: "string" },
              { name: "booking_count", type: "int" },
              { name: "gross_booking_value", type: "double" },
              { name: "avg_booking_value", type: "double" },
              { name: "last_booking_at", type: "timestamp" },
              { name: "frequent_flyer_score", type: "double" },
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
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "offer_name", type: "string" },
              { name: "use_case", type: "string" },
              { name: "propensity_score", type: "double" },
              { name: "recommended_channel", type: "string" },
              { name: "signal_value", type: "double" },
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
              { name: "customer_id", type: "string" },
              { name: "customer_name", type: "string" },
              { name: "offer_name", type: "string" },
              { name: "use_case", type: "string" },
              { name: "propensity_score", type: "double" },
              { name: "recommended_channel", type: "string" },
              { name: "signal_value", type: "double" },
              { name: "source_company", type: "string" },
              { name: "target_company", type: "string" },
              { name: "priority_band", type: "string" },
            ],
          },
          {
            name: "campaign_summary_v1",
            comment: "Compact campaign summary for activation planning.",
            columns: [
              { name: "campaign_name", type: "string" },
              { name: "source_company", type: "string" },
              { name: "target_company", type: "string" },
              { name: "offer_name", type: "string" },
              { name: "customer_count", type: "int" },
              { name: "avg_propensity_score", type: "double" },
              { name: "total_signal_value", type: "double" },
            ],
          },
        ],
      },
    ],
  },
]

function formatTableBlock(catalog: string, schema: string, table: StaticTable): string {
  const fqn = `${catalog}.${schema}.${table.name}`
  const cols = table.columns.map((c) => `  ${c.name} ${c.type}`).join(",\n")
  return `TABLE ${fqn}:\n  -- ${table.comment}\n${cols}`
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
            ...table.columns.map((c) => c.name),
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
  debugger;
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
