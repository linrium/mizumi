import { resolve } from "node:path"
import { loadConfig } from "./src/config"
import { streamBankingTransactionsToCsv } from "./src/banking"
import { streamBrandCustomersToCsv } from "./src/customers"
import { streamFlightIncidentsToCsv } from "./src/flight-incidents"
import { streamFlightTicketsToCsv } from "./src/flight-tickets"
import { streamVietnameseResidentsToCsv } from "./src/residents"

const configPath = resolve(process.argv[2] ?? "generate.config.json")
const raw = await Bun.file(configPath).json()
const config = loadConfig(raw)

console.log(`Using config: ${configPath}`)

for (const entry of config.generators) {
	const seed = entry.seed ?? config.seed

	if (entry.type === "vietnamese-residents") {
		const outputPath = await streamVietnameseResidentsToCsv({
			count: entry.count,
			outputPath: entry.output,
			seed,
		})
		console.log(`[vietnamese-residents] Wrote ${entry.count} rows → ${outputPath}`)
		continue
	}

	if (entry.type === "banking-transactions") {
		const outputPath = await streamBankingTransactionsToCsv({
			count: entry.count,
			outputPath: entry.output,
			residentsPath: entry.residentsPath,
			seed,
		})
		console.log(
			`[banking-transactions] Wrote ${entry.count} rows → ${outputPath} (residents: ${resolve(entry.residentsPath)})`,
		)
		continue
	}

	if (entry.type === "brand-customers") {
		const outputPaths = await streamBrandCustomersToCsv({
			count: entry.count,
			outputPath: entry.output,
			residentsPath: entry.residentsPath,
			seed,
		})
		console.log(
			`[brand-customers] Wrote HDBank → ${outputPaths.hdbankPath}, VietjetAir → ${outputPaths.vietjetAirPath} (residents: ${resolve(entry.residentsPath)})`,
		)
		continue
	}

	if (entry.type === "flight-tickets") {
		const outputPath = await streamFlightTicketsToCsv({
			count: entry.count,
			outputPath: entry.output,
			residentsPath: entry.residentsPath,
			seed,
		})
		console.log(
			`[flight-tickets] Wrote ${entry.count} rows → ${outputPath} (residents: ${resolve(entry.residentsPath)})`,
		)
		continue
	}

	if (entry.type === "flight-incidents") {
		const outputPath = await streamFlightIncidentsToCsv({
			count: entry.count,
			outputPath: entry.output,
			flightTicketsPath: entry.flightTicketsPath,
			trainDataPath: entry.trainDataPath,
			seed,
		})
		console.log(
			`[flight-incidents] Wrote ${entry.count} rows → ${outputPath} (tickets: ${resolve(entry.flightTicketsPath)})`,
		)
		continue
	}
}
