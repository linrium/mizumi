export interface ResidentsGeneratorConfig {
	type: "vietnamese-residents"
	count: number
	output: string
	seed?: number
}

export interface BankingTransactionsGeneratorConfig {
	type: "banking-transactions"
	count: number
	output: string
	residentsPath: string
	seed?: number
}

export interface BrandCustomersGeneratorConfig {
	type: "brand-customers"
	count: number
	output: string
	residentsPath: string
	seed?: number
}

export interface FlightTicketsGeneratorConfig {
	type: "flight-tickets"
	count: number
	output: string
	residentsPath: string
	seed?: number
}

export interface FlightIncidentsGeneratorConfig {
	type: "flight-incidents"
	count: number
	output: string
	flightTicketsPath: string
	trainDataPath?: string
	seed?: number
}

export type GeneratorConfig =
	| ResidentsGeneratorConfig
	| BankingTransactionsGeneratorConfig
	| BrandCustomersGeneratorConfig
	| FlightTicketsGeneratorConfig
	| FlightIncidentsGeneratorConfig

export interface GenerateConfig {
	seed?: number
	generators: GeneratorConfig[]
}

const VALID_TYPES = new Set([
	"vietnamese-residents",
	"banking-transactions",
	"brand-customers",
	"flight-tickets",
	"flight-incidents",
])

function assertString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`"${field}" must be a non-empty string`)
	}
	return value
}

function assertPositiveInt(value: unknown, field: string): number {
	if (!Number.isInteger(value) || (value as number) <= 0) {
		throw new Error(`"${field}" must be a positive integer`)
	}
	return value as number
}

function validateEntry(entry: unknown, index: number): GeneratorConfig {
	if (typeof entry !== "object" || entry === null) {
		throw new Error(`generators[${index}] must be an object`)
	}

	const e = entry as Record<string, unknown>
	const prefix = `generators[${index}]`

	if (!VALID_TYPES.has(e.type as string)) {
		throw new Error(
			`${prefix}.type must be one of: ${[...VALID_TYPES].join(", ")}`,
		)
	}

	const type = e.type as GeneratorConfig["type"]
	const count = assertPositiveInt(e.count, `${prefix}.count`)
	const output = assertString(e.output, `${prefix}.output`)
	const seed =
		e.seed !== undefined
			? assertPositiveInt(e.seed, `${prefix}.seed`)
			: undefined

	if (type === "vietnamese-residents") {
		return { type, count, output, seed }
	}

	if (type === "banking-transactions" || type === "brand-customers" || type === "flight-tickets") {
		const residentsPath = assertString(e.residentsPath, `${prefix}.residentsPath`)
		return { type, count, output, residentsPath, seed }
	}

	const flightTicketsPath = assertString(e.flightTicketsPath, `${prefix}.flightTicketsPath`)
	const trainDataPath = typeof e.trainDataPath === "string" ? e.trainDataPath : undefined
	return { type: "flight-incidents", count, output, flightTicketsPath, trainDataPath, seed }
}

export function loadConfig(raw: unknown): GenerateConfig {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("Config must be a JSON object")
	}

	const cfg = raw as Record<string, unknown>

	const seed =
		cfg.seed !== undefined
			? assertPositiveInt(cfg.seed, "seed")
			: undefined

	if (!Array.isArray(cfg.generators)) {
		throw new Error('"generators" must be an array')
	}

	const generators = cfg.generators.map((entry, i) => validateEntry(entry, i))

	return { seed, generators }
}
