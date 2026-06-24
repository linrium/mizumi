import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { streamBankingTransactionsToCsv } from "./src/banking"
import { streamBrandCustomersToCsv } from "./src/customers"
import { streamFlightIncidentsToCsv } from "./src/flight-incidents"
import { streamFlightTicketsToCsv } from "./src/flight-tickets"
import { streamVietnameseResidentsToCsv } from "./src/residents"
import type {
	BankingTransactionGeneratorOptions,
	BrandCustomerGeneratorOptions,
	CliOptions,
	FlightIncidentGeneratorOptions,
	FlightTicketGeneratorOptions,
	GeneratorOptions,
} from "./src/types"

interface DbxExampleOptions {
	outputPath: string
	residentCount: number
	customerCount: number
	transactionCount: number
	ticketCount: number
	incidentCount: number
	seed?: number
}

function parseCliArgs(argv: string[]): CliOptions {
	const firstArg = argv[0]
	const command =
		firstArg === "banking-transactions" ||
		firstArg === "brand-customers" ||
		firstArg === "dbx-example" ||
		firstArg === "flight-incidents" ||
		firstArg === "flight-tickets" ||
		firstArg === "vietnamese-residents"
			? firstArg
			: "vietnamese-residents"
	const args = command === firstArg ? argv.slice(1) : argv
	let count = 1_000
	let outputPath =
		command === "banking-transactions"
			? "output/banking_transactions.csv"
			: command === "brand-customers"
				? "output"
				: command === "dbx-example"
					? "output/dbx_example"
					: command === "flight-incidents"
						? "output/flight_incidents.csv"
						: command === "flight-tickets"
							? "output/flight_tickets.csv"
							: "output/vietnamese_residents.csv"
	let residentsPath =
		command === "flight-incidents"
			? "output/flight_tickets.csv"
			: "output/vietnamese_residents.csv"
	let seed: number | undefined

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]
		const value = args[index + 1]

		if ((arg === "--count" || arg === "-c") && value) {
			count = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if ((arg === "--output" || arg === "-o") && value) {
			outputPath = value
			index += 1
			continue
		}

		if (arg === "--residents" && value) {
			residentsPath = value
			index += 1
			continue
		}

		if (arg === "--tickets" && value) {
			residentsPath = value
			index += 1
			continue
		}

		if (arg === "--seed" && value) {
			seed = Number.parseInt(value, 10)
			index += 1
		}
	}

	if (!Number.isInteger(count) || count <= 0) {
		throw new Error("`--count` must be a positive integer.")
	}

	if (seed !== undefined && !Number.isInteger(seed)) {
		throw new Error("`--seed` must be an integer.")
	}

	if (command === "banking-transactions") {
		return {
			command,
			options: { count, outputPath, residentsPath, seed },
		}
	}

	if (command === "brand-customers") {
		return {
			command,
			options: { count, outputPath, residentsPath, seed },
		}
	}

	if (command === "flight-tickets") {
		return {
			command,
			options: { count, outputPath, residentsPath, seed },
		}
	}

	if (command === "flight-incidents") {
		return {
			command,
			options: {
				count,
				outputPath,
				flightTicketsPath: residentsPath,
				seed,
			},
		}
	}

	return {
		command,
		options: { count, outputPath, seed },
	}
}

function parseDbxExampleArgs(argv: string[]): DbxExampleOptions {
	let outputPath = "output/dbx_example"
	let residentCount = 10_000
	let customerCount = 5_000
	let transactionCount = 50_000
	let ticketCount = 20_000
	let incidentCount = 2_000
	let seed: number | undefined

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		const value = argv[index + 1]

		if ((arg === "--output" || arg === "-o") && value) {
			outputPath = value
			index += 1
			continue
		}

		if (arg === "--residents" && value) {
			residentCount = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if (arg === "--customers" && value) {
			customerCount = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if (arg === "--transactions" && value) {
			transactionCount = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if (arg === "--tickets" && value) {
			ticketCount = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if (arg === "--incidents" && value) {
			incidentCount = Number.parseInt(value, 10)
			index += 1
			continue
		}

		if (arg === "--seed" && value) {
			seed = Number.parseInt(value, 10)
			index += 1
		}
	}

	for (const [name, count] of Object.entries({
		"--residents": residentCount,
		"--customers": customerCount,
		"--transactions": transactionCount,
		"--tickets": ticketCount,
		"--incidents": incidentCount,
	})) {
		if (!Number.isInteger(count) || count <= 0) {
			throw new Error(`${name} must be a positive integer.`)
		}
	}

	if (seed !== undefined && !Number.isInteger(seed)) {
		throw new Error("`--seed` must be an integer.")
	}

	return {
		outputPath,
		residentCount,
		customerCount,
		transactionCount,
		ticketCount,
		incidentCount,
		seed,
	}
}

async function generateDbxExampleCsvs(options: DbxExampleOptions) {
	const outputPath = resolve(options.outputPath)
	const tempDir = await mkdtemp(`${tmpdir()}/mizumi-dbx-example-`)
	const residentsPath = `${tempDir}/vietnamese_residents.csv`

	try {
		await streamVietnameseResidentsToCsv({
			count: options.residentCount,
			outputPath: residentsPath,
			seed: options.seed,
		})

		const brandCustomerPaths = await streamBrandCustomersToCsv({
			count: options.customerCount,
			outputPath,
			residentsPath,
			seed: options.seed,
		})

		const bankingTransactionsPath = await streamBankingTransactionsToCsv({
			count: options.transactionCount,
			outputPath: `${outputPath}/banking_transactions.csv`,
			residentsPath,
			seed: options.seed,
		})

		const flightTicketsPath = await streamFlightTicketsToCsv({
			count: options.ticketCount,
			outputPath: `${outputPath}/flight_tickets.csv`,
			residentsPath,
			seed: options.seed,
		})

		const flightIncidentsPath = await streamFlightIncidentsToCsv({
			count: options.incidentCount,
			outputPath: `${outputPath}/flight_incidents.csv`,
			flightTicketsPath,
			seed: options.seed,
		})

		return {
			hdbankCustomersPath: brandCustomerPaths.hdbankPath,
			bankingTransactionsPath,
			vietjetAirCustomersPath: brandCustomerPaths.vietjetAirPath,
			flightTicketsPath,
			flightIncidentsPath,
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true })
	}
}

async function main() {
	const cli = parseCliArgs(process.argv.slice(2))

	if (cli.command === "banking-transactions") {
		const options = cli.options as BankingTransactionGeneratorOptions
		const outputPath = await streamBankingTransactionsToCsv(options)
		console.log(
			`Wrote ${options.count} banking transactions to ${outputPath} using residents from ${resolve(options.residentsPath)}`,
		)
		return
	}

	if (cli.command === "brand-customers") {
		const options = cli.options as BrandCustomerGeneratorOptions
		const outputPaths = await streamBrandCustomersToCsv(options)
		console.log(
			`Wrote HDBank customers to ${outputPaths.hdbankPath} and VietjetAir customers to ${outputPaths.vietjetAirPath} using residents from ${resolve(options.residentsPath)}`,
		)
		return
	}

	if (cli.command === "dbx-example") {
		const options = parseDbxExampleArgs(process.argv.slice(3))
		const outputPaths = await generateDbxExampleCsvs(options)
		console.log(`Wrote dbx_example CSVs to ${resolve(options.outputPath)}`)
		console.log(`- hdbank_customers.csv → ${outputPaths.hdbankCustomersPath}`)
		console.log(
			`- banking_transactions.csv → ${outputPaths.bankingTransactionsPath}`,
		)
		console.log(
			`- vietjetair_customers.csv → ${outputPaths.vietjetAirCustomersPath}`,
		)
		console.log(`- flight_tickets.csv → ${outputPaths.flightTicketsPath}`)
		console.log(`- flight_incidents.csv → ${outputPaths.flightIncidentsPath}`)
		return
	}

	if (cli.command === "flight-tickets") {
		const options = cli.options as FlightTicketGeneratorOptions
		const outputPath = await streamFlightTicketsToCsv(options)
		console.log(
			`Wrote ${options.count} flight tickets to ${outputPath} using residents from ${resolve(options.residentsPath)}`,
		)
		return
	}

	if (cli.command === "flight-incidents") {
		const options = cli.options as FlightIncidentGeneratorOptions
		const outputPath = await streamFlightIncidentsToCsv(options)
		console.log(
			`Wrote ${options.count} flight incident reports to ${outputPath} using Vietjet Air flight tickets from ${resolve(options.flightTicketsPath)}`,
		)
		return
	}

	const options = cli.options as GeneratorOptions
	const outputPath = await streamVietnameseResidentsToCsv(options)
	console.log(`Wrote ${options.count} Vietnamese residents to ${outputPath}`)
}

await main()
