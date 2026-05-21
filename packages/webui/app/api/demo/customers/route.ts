import { readFile } from "node:fs/promises"
import path from "node:path"

type CustomerRow = {
  unified_customer_id: string
  full_name: string
  city: string
  age: string
  hdbank_customer_id: string
  vietjetair_customer_id: string
  hdbank_segment: string
  preferred_channel: string
  monthly_income: string
  credit_score: string
  has_credit_card: string
  membership_tier: string
  home_airport: string
  email_opt_in: string
  shared_customer: string
  has_hdbank: string
  has_vietjetair: string
}

function parseCsv(content: string): CustomerRow[] {
  const lines = content.trim().split(/\r?\n/)
  const [header, ...rows] = lines
  const columns = header.split(",").map((column) => column.trim())

  return rows.map((line) => {
    const values = line.split(",").map((value) => value.trim())
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""]),
    ) as CustomerRow
  })
}

async function loadCustomers(): Promise<CustomerRow[]> {
  const candidatePaths = [
    path.resolve(process.cwd(), "data", "co_brand_customers.csv"),
    path.resolve(
      process.cwd(),
      "..",
      "spark",
      "jobs",
      "data",
      "co_brand_customers.csv",
    ),
  ]

  for (const csvPath of candidatePaths) {
    try {
      const csvContent = await readFile(csvPath, "utf-8")
      return parseCsv(csvContent)
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error
      }
    }
  }

  throw new Error("co_brand_customers.csv was not found in the webui runtime")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const company = searchParams.get("company")

  const allCustomers = await loadCustomers()

  const filteredCustomers = allCustomers.filter((customer) => {
    if (company === "hdbank") return customer.has_hdbank === "true"
    if (company === "vietjetair") return customer.has_vietjetair === "true"
    return true
  })

  return Response.json({
    customers: filteredCustomers,
    count: filteredCustomers.length,
  })
}
