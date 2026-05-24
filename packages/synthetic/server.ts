import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { Elysia, t } from "elysia"
import { readCsvRows } from "./src/csv"
import type {
	BankingTransactionInfo,
	FlightIncidentReportInfo,
	FlightTicketInfo,
	HdbankCustomerInfo,
	VietjetAirCustomerInfo,
	VietnameseResidentInfo,
} from "./src/types"

const SYNTHETIC_DATA_DIR = process.env.SYNTHETIC_DATA_DIR
const PORT = Number(process.env.PORT ?? 8092)

interface SyntheticPools {
	source: "rustfs"
	residents: VietnameseResidentInfo[]
	hdbankCustomers: HdbankCustomerInfo[]
	vietjetairCustomers: VietjetAirCustomerInfo[]
	bankingTransactions: BankingTransactionInfo[]
	flightTickets: FlightTicketInfo[]
	flightIncidents: FlightIncidentReportInfo[]
}

async function csvExists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

async function loadPoolsFromCsv(dataDir: string): Promise<SyntheticPools> {
	console.log(`Loading synthetic data from ${dataDir}...`)

	const residentsPath = resolve(dataDir, "vietnamese_residents.csv")
	const hdbankCustomersPath = resolve(dataDir, "hdbank_customers.csv")
	const vietjetairCustomersPath = resolve(dataDir, "vietjetair_customers.csv")
	const bankingTransactionsPath = resolve(dataDir, "banking_transactions.csv")
	const flightTicketsPath = resolve(dataDir, "flight_tickets.csv")
	const flightIncidentsPath = resolve(dataDir, "flight_incidents.csv")

	const requiredFiles = [
		residentsPath,
		hdbankCustomersPath,
		vietjetairCustomersPath,
		bankingTransactionsPath,
		flightTicketsPath,
		flightIncidentsPath,
	]

	const fileChecks = await Promise.all(
		requiredFiles.map((path) => csvExists(path)),
	)
	const missingFiles = requiredFiles.filter((_, index) => !fileChecks[index])

	if (missingFiles.length > 0) {
		throw new Error(`Missing synthetic CSV files: ${missingFiles.join(", ")}`)
	}

	const residents = await readCsvRows<VietnameseResidentInfo>(residentsPath)
	const hdbankCustomers =
		await readCsvRows<HdbankCustomerInfo>(hdbankCustomersPath)
	const vietjetairCustomers = await readCsvRows<VietjetAirCustomerInfo>(
		vietjetairCustomersPath,
	)
	const bankingTransactions = await readCsvRows<BankingTransactionInfo>(
		bankingTransactionsPath,
	)
	const flightTickets = await readCsvRows<FlightTicketInfo>(flightTicketsPath)
	const flightIncidents =
		await readCsvRows<FlightIncidentReportInfo>(flightIncidentsPath)

	console.log(`  residents: ${residents.length}`)
	console.log(`  hdbank-customers: ${hdbankCustomers.length}`)
	console.log(`  vietjetair-customers: ${vietjetairCustomers.length}`)
	console.log(`  banking-transactions: ${bankingTransactions.length}`)
	console.log(`  flight-tickets: ${flightTickets.length}`)
	console.log(`  flight-incidents: ${flightIncidents.length}`)

	return {
		source: "rustfs",
		residents,
		hdbankCustomers,
		vietjetairCustomers,
		bankingTransactions,
		flightTickets,
		flightIncidents,
	}
}

if (!SYNTHETIC_DATA_DIR) {
	throw new Error(
		"SYNTHETIC_DATA_DIR is required. The synthetic server now only serves RustFS-backed CSV data.",
	)
}

const pools = await loadPoolsFromCsv(SYNTHETIC_DATA_DIR)

const paginationQuery = t.Object({
	limit: t.Optional(t.Numeric({ default: 10, minimum: 1, maximum: 100 })),
	offset: t.Optional(t.Numeric({ default: 0, minimum: 0 })),
})

function paginate<T>(pool: T[], limit: number, offset: number) {
	const slice = pool.slice(offset, offset + limit)
	return {
		data: slice,
		total: pool.length,
		limit,
		offset,
		hasMore: offset + limit < pool.length,
	}
}

new Elysia()
	.get("/health", () => ({
		status: "ok",
		source: pools.source,
		pools: {
			residents: pools.residents.length,
			hdbankCustomers: pools.hdbankCustomers.length,
			vietjetairCustomers: pools.vietjetairCustomers.length,
			bankingTransactions: pools.bankingTransactions.length,
			flightTickets: pools.flightTickets.length,
			flightIncidents: pools.flightIncidents.length,
		},
	}))
	.get(
		"/hdbank-customers",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(pools.hdbankCustomers, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/vietjetair-customers",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(pools.vietjetairCustomers, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/banking-transactions",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(pools.bankingTransactions, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/flight-tickets",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(pools.flightTickets, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/flight-incidents",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(pools.flightIncidents, limit, offset)
		},
		{ query: paginationQuery },
	)
	.listen(PORT)

console.log(`Synthetic API running on http://localhost:${PORT}`)
