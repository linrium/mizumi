import { Elysia, t } from "elysia"
import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { generateBankingTransactions } from "./src/banking"
import { readCsvRows } from "./src/csv"
import { generateFlightIncidents } from "./src/flight-incidents"
import { generateFlightTickets } from "./src/flight-tickets"
import { generateVietnameseResident } from "./src/residents"
import type {
	BankingTransactionInfo,
	FlightIncidentReportInfo,
	FlightTicketInfo,
	VietnameseResidentInfo,
} from "./src/types"

const SEED = Number(process.env.SEED ?? 42)
const POOL_RESIDENTS = Number(process.env.POOL_RESIDENTS ?? 500)
const POOL_BANKING_TRANSACTIONS = Number(process.env.POOL_BANKING_TRANSACTIONS ?? 5000)
const POOL_FLIGHT_TICKETS = Number(process.env.POOL_FLIGHT_TICKETS ?? 3000)
const POOL_FLIGHT_INCIDENTS = Number(process.env.POOL_FLIGHT_INCIDENTS ?? 1000)
const SYNTHETIC_DATA_DIR = process.env.SYNTHETIC_DATA_DIR
const PORT = Number(process.env.PORT ?? 8092)

interface SyntheticPools {
	source: "generated" | "rustfs"
	residents: VietnameseResidentInfo[]
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
	const bankingTransactionsPath = resolve(dataDir, "banking_transactions.csv")
	const flightTicketsPath = resolve(dataDir, "flight_tickets.csv")
	const flightIncidentsPath = resolve(dataDir, "flight_incidents.csv")

	const requiredFiles = [
		residentsPath,
		bankingTransactionsPath,
		flightTicketsPath,
		flightIncidentsPath,
	]

	const fileChecks = await Promise.all(requiredFiles.map((path) => csvExists(path)))
	const missingFiles = requiredFiles.filter((_, index) => !fileChecks[index])

	if (missingFiles.length > 0) {
		throw new Error(`Missing synthetic CSV files: ${missingFiles.join(", ")}`)
	}

	const residents = await readCsvRows<VietnameseResidentInfo>(residentsPath)
	const bankingTransactions =
		await readCsvRows<BankingTransactionInfo>(bankingTransactionsPath)
	const flightTickets = await readCsvRows<FlightTicketInfo>(flightTicketsPath)
	const flightIncidents =
		await readCsvRows<FlightIncidentReportInfo>(flightIncidentsPath)

	console.log(`  residents: ${residents.length}`)
	console.log(`  banking-transactions: ${bankingTransactions.length}`)
	console.log(`  flight-tickets: ${flightTickets.length}`)
	console.log(`  flight-incidents: ${flightIncidents.length}`)

	return {
		source: "rustfs",
		residents,
		bankingTransactions,
		flightTickets,
		flightIncidents,
	}
}

function generatePools(): SyntheticPools {
	console.log("Generating data pools...")

	const residents = Array.from({ length: POOL_RESIDENTS }, generateVietnameseResident)
	console.log(`  residents: ${residents.length}`)

	const bankingTransactions = generateBankingTransactions(
		residents,
		POOL_BANKING_TRANSACTIONS,
		SEED,
	)
	console.log(`  banking-transactions: ${bankingTransactions.length}`)

	const flightTickets = generateFlightTickets(
		residents,
		POOL_FLIGHT_TICKETS,
		SEED + 1,
	)
	console.log(`  flight-tickets: ${flightTickets.length}`)

	const flightIncidents = generateFlightIncidents(
		flightTickets,
		POOL_FLIGHT_INCIDENTS,
		SEED + 2,
	)
	console.log(`  flight-incidents: ${flightIncidents.length}`)

	return {
		source: "generated",
		residents,
		bankingTransactions,
		flightTickets,
		flightIncidents,
	}
}

const pools =
	SYNTHETIC_DATA_DIR
		? await loadPoolsFromCsv(SYNTHETIC_DATA_DIR).catch((error) => {
				console.warn(
					`Synthetic CSV bootstrap unavailable, falling back to generated pools: ${
						error instanceof Error ? error.message : String(error)
					}`,
				)
				return generatePools()
			})
		: generatePools()

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
			bankingTransactions: pools.bankingTransactions.length,
			flightTickets: pools.flightTickets.length,
			flightIncidents: pools.flightIncidents.length,
		},
	}))
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
