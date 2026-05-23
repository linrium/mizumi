import { Elysia, t } from "elysia"
import { generateBankingTransactions } from "./src/banking"
import { generateFlightIncidents } from "./src/flight-incidents"
import { generateFlightTickets } from "./src/flight-tickets"
import { generateVietnameseResident } from "./src/residents"
import type {
	BankingTransactionInfo,
	FlightIncidentReportInfo,
	FlightTicketInfo,
} from "./src/types"

const SEED = Number(process.env.SEED ?? 42)
const POOL_RESIDENTS = Number(process.env.POOL_RESIDENTS ?? 500)
const POOL_BANKING_TRANSACTIONS = Number(process.env.POOL_BANKING_TRANSACTIONS ?? 5000)
const POOL_FLIGHT_TICKETS = Number(process.env.POOL_FLIGHT_TICKETS ?? 3000)
const POOL_FLIGHT_INCIDENTS = Number(process.env.POOL_FLIGHT_INCIDENTS ?? 1000)
const PORT = Number(process.env.PORT ?? 8092)

console.log("Generating data pools...")

const residents = Array.from({ length: POOL_RESIDENTS }, generateVietnameseResident)
console.log(`  residents: ${residents.length}`)

const bankingTransactions: BankingTransactionInfo[] = generateBankingTransactions(
	residents,
	POOL_BANKING_TRANSACTIONS,
	SEED,
)
console.log(`  banking-transactions: ${bankingTransactions.length}`)

const flightTickets: FlightTicketInfo[] = generateFlightTickets(
	residents,
	POOL_FLIGHT_TICKETS,
	SEED + 1,
)
console.log(`  flight-tickets: ${flightTickets.length}`)

const flightIncidents: FlightIncidentReportInfo[] = generateFlightIncidents(
	flightTickets,
	POOL_FLIGHT_INCIDENTS,
	SEED + 2,
)
console.log(`  flight-incidents: ${flightIncidents.length}`)

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

const app = new Elysia()
	.get("/health", () => ({
		status: "ok",
		pools: {
			bankingTransactions: bankingTransactions.length,
			flightTickets: flightTickets.length,
			flightIncidents: flightIncidents.length,
		},
	}))
	.get(
		"/banking-transactions",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(bankingTransactions, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/flight-tickets",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(flightTickets, limit, offset)
		},
		{ query: paginationQuery },
	)
	.get(
		"/flight-incidents",
		({ query }) => {
			const limit = query.limit ?? 10
			const offset = query.offset ?? 0
			return paginate(flightIncidents, limit, offset)
		},
		{ query: paginationQuery },
	)
	.listen(PORT)

console.log(`Synthetic API running on http://localhost:${PORT}`)
