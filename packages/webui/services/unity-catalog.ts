const UC_BASE =
  process.env.UC_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "http://unitycatalog-svc.unitycatalog.svc.cluster.local:8080/api/2.1/unity-catalog"
    : "http://localhost:8082/api/2.1/unity-catalog")

interface CatalogInfo {
  name: string
}
interface SchemaInfo {
  catalog_name: string
  name: string
}
interface TableInfo {
  catalog_name: string
  name: string
  schema_name: string
}
interface ColumnInfo {
  name: string
  type_text: string
}
interface TableDetail {
  catalog_name: string
  columns: ColumnInfo[]
  name: string
  schema_name: string
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
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
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

interface StaticCol {
  description: string
  name: string
  type: string
}
interface StaticTable {
  columns: StaticCol[]
  comment: string
  name: string
}
interface StaticSchema {
  comment: string
  name: string
  tables: StaticTable[]
}
interface StaticCatalog {
  comment: string
  name: string
  schemas: StaticSchema[]
}

const STATIC_CATALOGS: StaticCatalog[] = [
  {
    comment:
      "HDBank demo catalog for co-branded travel card and ticket financing.",
    name: "hdbank",
    schemas: [
      {
        comment: "Raw HDBank partner events from the single company topic.",
        name: "hdbank_partnership_prod_bronze",
        tables: [
          {
            columns: [
              {
                description: "Kafka message ingestion timestamp",
                name: "timestamp",
                type: "timestamp",
              },
              {
                description:
                  "Kafka partition key identifying the customer or entity",
                name: "key",
                type: "string",
              },
              {
                description:
                  "Event discriminator, e.g. card_transaction, customer_update, credit_check",
                name: "event_type",
                type: "string",
              },
              {
                description: "JSON-encoded payload of the event",
                name: "value",
                type: "string",
              },
            ],
            comment: "Mixed HDBank customer and card transaction events.",
            name: "partner_events_v1",
          },
          {
            columns: [
              {
                description:
                  "Cross-company identifier linking HDBank and VietJet customer records",
                name: "unified_customer_id",
                type: "string",
              },
              {
                description: "HDBank internal customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Full name of the HDBank customer",
                name: "customer_name",
                type: "string",
              },
              {
                description: "City of residence",
                name: "city",
                type: "string",
              },
              {
                description: "Customer age in years",
                name: "age",
                type: "int",
              },
              {
                description:
                  "HDBank customer segment, e.g. Mass, Affluent, Premier",
                name: "segment_name",
                type: "string",
              },
              {
                description:
                  "Preferred contact channel, e.g. mobile, branch, email",
                name: "preferred_channel",
                type: "string",
              },
              {
                description: "Declared or estimated monthly income in VND",
                name: "monthly_income",
                type: "double",
              },
              {
                description: "HDBank internal credit score",
                name: "credit_score",
                type: "int",
              },
              {
                description:
                  "Whether the customer holds an active HDBank credit card",
                name: "has_credit_card",
                type: "boolean",
              },
              {
                description:
                  "Whether this customer record is also shared with VietJet",
                name: "shared_customer",
                type: "boolean",
              },
              {
                description:
                  "Timestamp when the seed record was loaded into the bronze layer",
                name: "seed_timestamp",
                type: "timestamp",
              },
            ],
            comment:
              "Seeded HDBank customer master rows for the partnership demo.",
            name: "customers_v1",
          },
        ],
      },
      {
        comment: "HDBank customer and travel-affinity features.",
        name: "hdbank_partnership_prod_silver",
        tables: [
          {
            columns: [
              {
                description: "HDBank internal customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Full name of the customer",
                name: "customer_name",
                type: "string",
              },
              {
                description:
                  "HDBank customer segment, e.g. Mass, Affluent, Premier",
                name: "segment_name",
                type: "string",
              },
              {
                description:
                  "KYC verification status, e.g. verified, pending, rejected",
                name: "kyc_status",
                type: "string",
              },
              {
                description:
                  "Preferred contact channel, e.g. mobile, branch, email",
                name: "preferred_channel",
                type: "string",
              },
              {
                description: "Monthly income in VND",
                name: "monthly_income",
                type: "double",
              },
              {
                description: "HDBank internal credit score",
                name: "credit_score",
                type: "int",
              },
              {
                description: "Active HDBank credit card flag",
                name: "has_credit_card",
                type: "boolean",
              },
              {
                description: "Whether this customer is also known to VietJet",
                name: "shared_customer",
                type: "boolean",
              },
              {
                description: "Timestamp of the most recent profile update",
                name: "updated_at",
                type: "timestamp",
              },
            ],
            comment: "Latest HDBank customer profiles for cross-sell analysis.",
            name: "customers_v1",
          },
          {
            columns: [
              {
                description: "HDBank customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Total number of card transactions observed",
                name: "transaction_count",
                type: "int",
              },
              {
                description: "Total card spend across all merchants in VND",
                name: "total_card_spend",
                type: "double",
              },
              {
                description: "Spend on travel-related merchants in VND",
                name: "travel_spend",
                type: "double",
              },
              {
                description:
                  "1 if the customer has any VietJet-related card spend, 0 otherwise",
                name: "has_vietjet_spend",
                type: "int",
              },
              {
                description: "Timestamp of the most recent card payment",
                name: "last_payment_at",
                type: "timestamp",
              },
              {
                description:
                  "Derived score (0–1) indicating likelihood of VietJet conversion based on travel spend patterns",
                name: "travel_affinity_score",
                type: "double",
              },
            ],
            comment: "Travel affinity features from HDBank card transactions.",
            name: "travel_spend_features_v1",
          },
        ],
      },
      {
        comment: "HDBank outbound activation targets for VietJet.",
        name: "hdbank_partnership_prod_gold",
        tables: [
          {
            columns: [
              {
                description: "HDBank customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Customer full name",
                name: "customer_name",
                type: "string",
              },
              {
                description:
                  "Co-brand offer name being recommended, e.g. vietjet_co_brand_card",
                name: "offer_name",
                type: "string",
              },
              {
                description:
                  "Business use case driving the recommendation, e.g. co_brand_travel_card",
                name: "use_case",
                type: "string",
              },
              {
                description:
                  "Model-derived propensity score (0–1); higher means more likely to convert",
                name: "propensity_score",
                type: "double",
              },
              {
                description:
                  "Best contact channel for activating this customer",
                name: "recommended_channel",
                type: "string",
              },
              {
                description:
                  "Aggregate monetary signal (VND) driving the recommendation",
                name: "signal_value",
                type: "double",
              },
            ],
            comment:
              "HDBank customers most likely to convert into VietJet flyers.",
            name: "vietjet_activation_candidates_v1",
          },
        ],
      },
    ],
  },
  {
    comment: "VietJet Air demo catalog for HDBank travel financing cross-sell.",
    name: "vietjetair",
    schemas: [
      {
        comment: "Raw VietJet partner events from the single company topic.",
        name: "vietjetair_partnership_prod_bronze",
        tables: [
          {
            columns: [
              {
                description: "Kafka message ingestion timestamp",
                name: "timestamp",
                type: "timestamp",
              },
              {
                description:
                  "Kafka partition key identifying the customer or booking",
                name: "key",
                type: "string",
              },
              {
                description:
                  "Event discriminator, e.g. booking, cancellation, customer_update",
                name: "event_type",
                type: "string",
              },
              {
                description: "JSON-encoded payload of the event",
                name: "value",
                type: "string",
              },
            ],
            comment: "Mixed VietJet customer and booking events.",
            name: "partner_events_v1",
          },
          {
            columns: [
              {
                description:
                  "Cross-company identifier linking VietJet and HDBank customer records",
                name: "unified_customer_id",
                type: "string",
              },
              {
                description: "VietJet internal customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Full name of the VietJet customer",
                name: "customer_name",
                type: "string",
              },
              {
                description: "City of residence",
                name: "city",
                type: "string",
              },
              {
                description: "Customer age in years",
                name: "age",
                type: "int",
              },
              {
                description:
                  "VietJet loyalty program tier, e.g. Sky Boss, SkyJoy Silver, SkyJoy Gold",
                name: "membership_tier",
                type: "string",
              },
              {
                description:
                  "Primary departure airport IATA code, e.g. SGN, HAN",
                name: "home_airport",
                type: "string",
              },
              {
                description:
                  "Whether the customer has opted into email marketing",
                name: "email_opt_in",
                type: "boolean",
              },
              {
                description:
                  "Whether this customer record is also shared with HDBank",
                name: "shared_customer",
                type: "boolean",
              },
              {
                description:
                  "Timestamp when the seed record was loaded into the bronze layer",
                name: "seed_timestamp",
                type: "timestamp",
              },
            ],
            comment:
              "Seeded VietJet customer master rows for the partnership demo.",
            name: "customers_v1",
          },
        ],
      },
      {
        comment: "VietJet customer and booking features.",
        name: "vietjetair_partnership_prod_silver",
        tables: [
          {
            columns: [
              {
                description: "VietJet internal customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Full name of the customer",
                name: "customer_name",
                type: "string",
              },
              {
                description: "VietJet loyalty tier",
                name: "membership_tier",
                type: "string",
              },
              {
                description: "Primary departure airport IATA code",
                name: "home_airport",
                type: "string",
              },
              {
                description: "Email marketing opt-in flag",
                name: "email_opt_in",
                type: "boolean",
              },
              {
                description: "Whether this customer is also known to HDBank",
                name: "shared_customer",
                type: "boolean",
              },
              {
                description: "Timestamp of the most recent profile update",
                name: "updated_at",
                type: "timestamp",
              },
            ],
            comment:
              "Latest VietJet customer profiles for cross-sell analysis.",
            name: "customers_v1",
          },
          {
            columns: [
              {
                description: "VietJet customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Total number of VietJet flight bookings",
                name: "booking_count",
                type: "int",
              },
              {
                description: "Total value of all bookings in VND",
                name: "gross_booking_value",
                type: "double",
              },
              {
                description: "Average booking value per trip in VND",
                name: "avg_booking_value",
                type: "double",
              },
              {
                description: "Timestamp of the most recent booking",
                name: "last_booking_at",
                type: "timestamp",
              },
              {
                description:
                  "Derived score (0–1) measuring booking intensity and recency",
                name: "frequent_flyer_score",
                type: "double",
              },
            ],
            comment: "Booking intensity features for HDBank finance targeting.",
            name: "booking_features_v1",
          },
        ],
      },
      {
        comment: "VietJet outbound activation targets for HDBank.",
        name: "vietjetair_partnership_prod_gold",
        tables: [
          {
            columns: [
              {
                description: "VietJet customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Customer full name",
                name: "customer_name",
                type: "string",
              },
              {
                description:
                  "Financing or co-brand offer name, e.g. hdbank_ticket_financing",
                name: "offer_name",
                type: "string",
              },
              {
                description:
                  "Business use case, e.g. ticket_financing, co_brand_card",
                name: "use_case",
                type: "string",
              },
              {
                description: "Model-derived propensity score (0–1)",
                name: "propensity_score",
                type: "double",
              },
              {
                description:
                  "Best contact channel for activating this customer",
                name: "recommended_channel",
                type: "string",
              },
              {
                description:
                  "Aggregate monetary signal driving the recommendation",
                name: "signal_value",
                type: "double",
              },
            ],
            comment:
              "VietJet flyers most likely to take HDBank financing or a co-brand card.",
            name: "hdbank_finance_candidates_v1",
          },
        ],
      },
    ],
  },
  {
    comment: "Shared partnership outputs for co-brand campaign planning.",
    name: "partnership",
    schemas: [
      {
        comment: "Joint campaign audience and summary outputs.",
        name: "co_brand_gold",
        tables: [
          {
            columns: [
              {
                description: "Unified cross-company customer identifier",
                name: "customer_id",
                type: "string",
              },
              {
                description: "Customer full name",
                name: "customer_name",
                type: "string",
              },
              {
                description: "Co-brand offer being promoted",
                name: "offer_name",
                type: "string",
              },
              {
                description: "Business use case driving the audience selection",
                name: "use_case",
                type: "string",
              },
              {
                description: "Propensity score (0–1) for offer acceptance",
                name: "propensity_score",
                type: "double",
              },
              {
                description: "Best contact channel for activation",
                name: "recommended_channel",
                type: "string",
              },
              {
                description: "Monetary signal value in VND",
                name: "signal_value",
                type: "double",
              },
              {
                description:
                  "Company that contributed this customer (hdbank or vietjetair)",
                name: "source_company",
                type: "string",
              },
              {
                description: "Company that will activate the offer",
                name: "target_company",
                type: "string",
              },
              {
                description: "Campaign priority tier: high, medium, or low",
                name: "priority_band",
                type: "string",
              },
            ],
            comment:
              "Unified outbound audience for the co-brand travel use case.",
            name: "co_brand_offer_audience_v1",
          },
          {
            columns: [
              {
                description: "Unique campaign identifier",
                name: "campaign_name",
                type: "string",
              },
              {
                description: "Company contributing the audience",
                name: "source_company",
                type: "string",
              },
              {
                description: "Company activating the offer",
                name: "target_company",
                type: "string",
              },
              {
                description: "Co-brand offer name",
                name: "offer_name",
                type: "string",
              },
              {
                description: "Number of customers in the campaign audience",
                name: "customer_count",
                type: "int",
              },
              {
                description: "Average propensity score across the audience",
                name: "avg_propensity_score",
                type: "double",
              },
              {
                description:
                  "Sum of signal values for the entire audience in VND",
                name: "total_signal_value",
                type: "double",
              },
            ],
            comment: "Compact campaign summary for activation planning.",
            name: "campaign_summary_v1",
          },
        ],
      },
    ],
  },
]

function formatTableBlock(
  catalog: string,
  schema: string,
  table: StaticTable
): string {
  const fqn = `${catalog}.${schema}.${table.name}`
  const cols = table.columns
    .map((c) => `  ${c.name} ${c.type}  -- ${c.description}`)
    .join(",\n")
  return `TABLE ${fqn}:\n  -- ${table.comment}\n${cols}`
}

export interface StaticSchemaHit {
  catalog: string
  fqn: string
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
          if (!haystack.includes(q)) {
            continue
          }
        }
        const fqn = `${catalog.name}.${schema.name}.${table.name}`
        hits.push({
          catalog: catalog.name,
          fqn,
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
          if (!haystack.includes(q)) {
            continue
          }
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
    token
  )
  const catalogs = (catalogsData?.catalogs ?? []).filter(
    (c) => c.name !== "unity"
  )
  if (catalogs.length === 0) {
    return FALLBACK_SCHEMA
  }

  const schemasByCatalog = await Promise.all(
    catalogs.map(async (catalog) => {
      const data = await ucGet<{ schemas: SchemaInfo[] }>(
        `/schemas?catalog_name=${catalog.name}&max_results=200`,
        token
      )
      return (data?.schemas ?? []).filter(
        (schema) => schema.name !== "information_schema"
      )
    })
  )

  const allSchemas = schemasByCatalog.flat()
  const tablesBySchema = await Promise.all(
    allSchemas.map(async (schema) => {
      const data = await ucGet<{ tables: TableInfo[] }>(
        `/tables?catalog_name=${schema.catalog_name}&schema_name=${schema.name}&max_results=200`,
        token
      )
      return data?.tables ?? []
    })
  )

  const details = await Promise.all(
    tablesBySchema
      .flat()
      .map((table) =>
        ucGet<TableDetail>(
          `/tables/${table.catalog_name}.${table.schema_name}.${table.name}`,
          token
        )
      )
  )

  const live = details
    .flatMap((table) => {
      if (!table) {
        return []
      }
      const fqn = `${table.catalog_name}.${table.schema_name}.${table.name}`
      const columns = (table.columns ?? [])
        .map((col) => `  ${col.name} ${col.type_text}`)
        .join(",\n")
      return [`TABLE ${fqn}:\n${columns}`]
    })
    .join("\n\n")

  return live || FALLBACK_SCHEMA
}
