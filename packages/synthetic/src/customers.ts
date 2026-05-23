import { dirname, resolve } from "node:path"
import { fakerVI as faker } from "@faker-js/faker"
import { escapeCsv, readCsvRows, streamCsvRows } from "./csv"
import {
	HDBANK_CUSTOMER_CSV_HEADERS,
	type BrandCustomerGeneratorOptions,
	type CustomerCase,
	type HdbankCustomerInfo,
	type VietjetAirCustomerInfo,
	type VietnameseResidentInfo,
	VIETJETAIR_CUSTOMER_CSV_HEADERS,
} from "./types"

interface BrandAffiliation {
	resident: VietnameseResidentInfo
	age: number
	customerCase: CustomerCase
	hdbankAffinityScore: number
	vietjetAirAffinityScore: number
	hdbankSince: string
	vietjetAirSince: string
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

function sigmoid(value: number): number {
	return 1 / (1 + Math.exp(-value))
}

function hashString(input: string): number {
	let hash = 0

	for (let index = 0; index < input.length; index += 1) {
		hash = (hash * 31 + input.charCodeAt(index)) % 1_000_003
	}

	return hash
}

function ageFromDateOfBirth(dateOfBirth: string): number {
	const dob = new Date(dateOfBirth)
	const now = new Date()
	let age = now.getUTCFullYear() - dob.getUTCFullYear()
	const hasHadBirthdayThisYear =
		now.getUTCMonth() > dob.getUTCMonth() ||
		(now.getUTCMonth() === dob.getUTCMonth() &&
			now.getUTCDate() >= dob.getUTCDate())

	if (!hasHadBirthdayThisYear) {
		age -= 1
	}

	return age
}

function cityBankBias(city: string): number {
	switch (city) {
		case "Ho Chi Minh":
			return 0.22
		case "Ha Noi":
			return 0.2
		case "Da Nang":
			return 0.13
		case "Hai Phong":
			return 0.11
		default:
			return 0.08
	}
}

function cityAirlineBias(city: string): number {
	switch (city) {
		case "Ho Chi Minh":
			return 0.24
		case "Ha Noi":
			return 0.23
		case "Da Nang":
			return 0.18
		case "Hai Phong":
			return 0.14
		default:
			return 0.1
	}
}

function bankAffinityScore(resident: VietnameseResidentInfo, age: number): number {
	const hash = hashString(`${resident.id}:${resident.city}:bank`)
	const normalizedHash = hash / 1_000_003
	const agePeak = 1 - Math.abs(age - 36) / 28
	const wave = Math.sin(normalizedHash * Math.PI * 6) * 0.22
	const seasonal = Math.cos(age / 7) * 0.12
	const base =
		-0.1 +
		cityBankBias(resident.city) +
		0.34 * agePeak +
		wave +
		seasonal +
		(normalizedHash - 0.5) * 0.3

	return clamp(sigmoid(base), 0.08, 0.97)
}

function airlineAffinityScore(
	resident: VietnameseResidentInfo,
	age: number,
): number {
	const hash = hashString(`${resident.id}:${resident.city}:air`)
	const normalizedHash = hash / 1_000_003
	const agePeak = 1 - Math.abs(age - 31) / 22
	const wave = Math.sin(normalizedHash * Math.PI * 7 + 0.8) * 0.24
	const seasonal = Math.cos(age / 5.5) * 0.1
	const base =
		-0.18 +
		cityAirlineBias(resident.city) +
		0.36 * agePeak +
		wave +
		seasonal +
		(normalizedHash - 0.5) * 0.26

	return clamp(sigmoid(base), 0.06, 0.97)
}

function classifyCustomerCase(
	bankScore: number,
	airlineScore: number,
	resident: VietnameseResidentInfo,
): CustomerCase {
	const coupling =
		Math.sin(hashString(`${resident.id}:coupling`) / 10_000) * 0.08 + 0.02

	if (bankScore > 0.57 && airlineScore > 0.56 - coupling) {
		return "both_hdbank_and_vietjetair"
	}

	if (bankScore - airlineScore >= -0.04 + coupling) {
		return "only_hdbank"
	}

	return "only_vietjetair"
}

function membershipSince(
	resident: VietnameseResidentInfo,
	label: "air" | "bank",
	isMember: boolean,
): string {
	if (!isMember) {
		return ""
	}

	const hash = hashString(`${resident.id}:${label}:since`)
	const yearsBack = 1 + (hash % 7)
	const dayOffset = (hash % 330) + 1
	const since = new Date()
	since.setUTCDate(since.getUTCDate() - (yearsBack * 365 + dayOffset))
	return since.toISOString().slice(0, 10)
}

function averageMonthlyBalance(
	resident: VietnameseResidentInfo,
	age: number,
	score: number,
): number {
	const cityMultiplier =
		resident.city === "Ho Chi Minh"
			? 1.18
			: resident.city === "Ha Noi"
				? 1.14
				: resident.city === "Da Nang"
					? 1.03
					: 0.96
	const ageFactor = 0.75 + age / 55
	const wave =
		0.92 + 0.18 * Math.sin(hashString(`${resident.id}:bal`) / 20_000)
	return Math.round(8_000_000 * cityMultiplier * ageFactor * (0.7 + score) * wave)
}

function customerTier(
	score: number,
	averageBalance: number,
): HdbankCustomerInfo["customerTier"] {
	if (score > 0.83 && averageBalance > 55_000_000) {
		return "diamond"
	}

	if (score > 0.72 && averageBalance > 32_000_000) {
		return "platinum"
	}

	if (score > 0.56 && averageBalance > 15_000_000) {
		return "gold"
	}

	return "standard"
}

function creditScoreBand(
	score: number,
	age: number,
): HdbankCustomerInfo["creditScoreBand"] {
	const signal = score + age / 120

	if (signal > 1.2) {
		return "A"
	}

	if (signal > 0.92) {
		return "B"
	}

	return "C"
}

function annualFlights(age: number, score: number, city: string): number {
	const cityFactor =
		city === "Ho Chi Minh" || city === "Ha Noi"
			? 1.25
			: city === "Da Nang"
				? 1.12
				: 1
	const base = 1.5 + 14 * score + Math.max(0, 42 - Math.abs(age - 30)) / 12
	return Math.max(1, Math.round(base * cityFactor))
}

function skybossTier(
	score: number,
	flights: number,
): VietjetAirCustomerInfo["skybossTier"] {
	if (score > 0.84 && flights >= 18) {
		return "skyboss"
	}

	if (score > 0.72 && flights >= 11) {
		return "platinum"
	}

	if (score > 0.58 && flights >= 6) {
		return "gold"
	}

	return "eco"
}

function ancillarySpendScore(score: number, flights: number): number {
	return clamp(0.35 + score * 0.45 + flights / 40, 0.15, 0.98)
}

function buildAffiliation(resident: VietnameseResidentInfo): BrandAffiliation {
	const age = ageFromDateOfBirth(resident.dateOfBirth)
	const hdbankAffinityScore = bankAffinityScore(resident, age)
	const vietjetAirAffinityScore = airlineAffinityScore(resident, age)
	const customerCase = classifyCustomerCase(
		hdbankAffinityScore,
		vietjetAirAffinityScore,
		resident,
	)

	return {
		resident,
		age,
		customerCase,
		hdbankAffinityScore,
		vietjetAirAffinityScore,
		hdbankSince: membershipSince(
			resident,
			"bank",
			customerCase !== "only_vietjetair",
		),
		vietjetAirSince: membershipSince(
			resident,
			"air",
			customerCase !== "only_hdbank",
		),
	}
}

function hdbankRecordToCsvRow(customer: HdbankCustomerInfo): string {
	return `${HDBANK_CUSTOMER_CSV_HEADERS.map((header) =>
		escapeCsv(String(customer[header])),
	).join(",")}\n`
}

function vietjetRecordToCsvRow(customer: VietjetAirCustomerInfo): string {
	return `${VIETJETAIR_CUSTOMER_CSV_HEADERS.map((header) =>
		escapeCsv(String(customer[header])),
	).join(",")}\n`
}

function shuffleResidents<T>(items: T[]): T[] {
	const copy = [...items]

	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = faker.number.int({ min: 0, max: index })
		;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
	}

	return copy
}

function buildHdbankCustomerRecord(
	affiliation: BrandAffiliation,
): HdbankCustomerInfo | null {
	if (affiliation.customerCase === "only_vietjetair") {
		return null
	}

	const balance = averageMonthlyBalance(
		affiliation.resident,
		affiliation.age,
		affiliation.hdbankAffinityScore,
	)

	return {
		userId: affiliation.resident.id,
		fullName: affiliation.resident.fullName,
		city: affiliation.resident.city,
		age: affiliation.age,
		customerCase: affiliation.customerCase,
		customerTier: customerTier(affiliation.hdbankAffinityScore, balance),
		hdbankAffinityScore: affiliation.hdbankAffinityScore.toFixed(4),
		averageMonthlyBalance: balance.toString(),
		creditScoreBand: creditScoreBand(
			affiliation.hdbankAffinityScore,
			affiliation.age,
		),
		hdbankSince: affiliation.hdbankSince,
		hasVietjetCoBrandCard:
			affiliation.customerCase === "both_hdbank_and_vietjetair"
				? "true"
				: "false",
	}
}

function buildVietjetCustomerRecord(
	affiliation: BrandAffiliation,
): VietjetAirCustomerInfo | null {
	if (affiliation.customerCase === "only_hdbank") {
		return null
	}

	const flights = annualFlights(
		affiliation.age,
		affiliation.vietjetAirAffinityScore,
		affiliation.resident.city,
	)

	return {
		userId: affiliation.resident.id,
		fullName: affiliation.resident.fullName,
		city: affiliation.resident.city,
		age: affiliation.age,
		customerCase: affiliation.customerCase,
		skybossTier: skybossTier(affiliation.vietjetAirAffinityScore, flights),
		vietjetAirAffinityScore: affiliation.vietjetAirAffinityScore.toFixed(4),
		annualFlights: flights,
		ancillarySpendScore: ancillarySpendScore(
			affiliation.vietjetAirAffinityScore,
			flights,
		).toFixed(4),
		vietjetAirSince: affiliation.vietjetAirSince,
		hasHdbankCoBrandCard:
			affiliation.customerCase === "both_hdbank_and_vietjetair"
				? "true"
				: "false",
	}
}

export async function streamBrandCustomersToCsv(
	options: BrandCustomerGeneratorOptions,
): Promise<{ hdbankPath: string; vietjetAirPath: string }> {
	if (options.seed !== undefined) {
		faker.seed(options.seed)
	}

	const residents = await readCsvRows<VietnameseResidentInfo>(options.residentsPath)

	if (residents.length === 0) {
		throw new Error(`No residents loaded from ${options.residentsPath}.`)
	}

	const selectedResidents = shuffleResidents(residents).slice(
		0,
		Math.min(options.count, residents.length),
	)
	const affiliations = selectedResidents.map(buildAffiliation)
	const outputDir = resolve(options.outputPath)

	function* hdbankRows() {
		for (const affiliation of affiliations) {
			const record = buildHdbankCustomerRecord(affiliation)
			if (record) {
				yield record
			}
		}
	}

	function* vietjetRows() {
		for (const affiliation of affiliations) {
			const record = buildVietjetCustomerRecord(affiliation)
			if (record) {
				yield record
			}
		}
	}

	const hdbankPath = await streamCsvRows(
		`${outputDir}/hdbank_customers.csv`,
		HDBANK_CUSTOMER_CSV_HEADERS,
		hdbankRows(),
		hdbankRecordToCsvRow,
	)
	const vietjetAirPath = await streamCsvRows(
		`${outputDir}/vietjetair_customers.csv`,
		VIETJETAIR_CUSTOMER_CSV_HEADERS,
		vietjetRows(),
		vietjetRecordToCsvRow,
	)

	return {
		hdbankPath,
		vietjetAirPath,
	}
}
