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

function parseCliArgs(argv: string[]): CliOptions {
	const firstArg = argv[0]
	const command =
		firstArg === "banking-transactions" ||
		firstArg === "brand-customers" ||
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
				: command === "flight-incidents"
					? "output/flight_incidents.csv"
				: command === "flight-tickets"
					? "output/flight_tickets.csv"
			: "output/vietnamese_residents.csv"
	let residentsPath =
		command === "flight-incidents" ? "output/flight_tickets.csv" : "output/vietnamese_residents.csv"
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
