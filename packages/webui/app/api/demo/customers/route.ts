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
  const lines = content.trim().split("\n")
  const [header, ...rows] = lines
  const columns = header.split(",")

  return rows.map((line) => {
    const values = line.split(",")
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index] ?? ""]),
    ) as CustomerRow
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const company = searchParams.get("company")

  const csvPath = path.resolve(
    process.cwd(),
    "..",
    "spark",
    "jobs",
    "data",
    "co_brand_customers.csv",
  )
  const csvContent = await readFile(csvPath, "utf-8")
  const allCustomers = parseCsv(csvContent)

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
