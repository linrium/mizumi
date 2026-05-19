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
const FALLBACK_SCHEMA = `\
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

async function ucGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${UC_BASE}${path}`, { cache: "no-store" })
    if (!res.ok) {
      return null
    }
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchSchema(): Promise<string> {
  const catalogsData = await ucGet<{ catalogs: CatalogInfo[] }>(
    "/catalogs?max_results=100",
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
