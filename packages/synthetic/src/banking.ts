import { fakerVI as faker } from "@faker-js/faker"
import { escapeCsv, readCsvRows, streamCsvRows } from "./csv"
import {
	AIRLINE_TRAVEL_MERCHANTS,
	FAMOUS_PLACE_TRAVEL_MERCHANTS,
	OTA_TRAVEL_MERCHANTS,
} from "./travel"
import {
	BANKING_TRANSACTION_CSV_HEADERS,
	type BankingTransactionGeneratorOptions,
	type BankingTransactionInfo,
	type BankName,
	type VietnameseResidentInfo,
} from "./types"

interface BankingUserProfile {
	userId: string
	accountId: string
	city: string
	sourceBank: BankName
	monthlyIncome: number
	activityScore: number
	initialBalance: number
}

const BANK_NAMES: BankName[] = [
	"hdbank",
	"techcombank",
	"vietcombank",
	"bidv",
	"agribank",
	"vietinbank",
	"smbc",
	"mufg",
	"oub",
	"citibank",
	"shinhan",
]

const VIETNAMESE_BANKS: BankName[] = [
	"hdbank",
	"techcombank",
	"vietcombank",
	"bidv",
	"agribank",
	"vietinbank",
]

const FOREIGN_BANKS: BankName[] = ["smbc", "mufg", "oub", "citibank", "shinhan"]

const MERCHANT_NAMES = {
	airline_ticket: AIRLINE_TRAVEL_MERCHANTS,
	cash: ["ATM Cash Withdrawal", "Branch Cash Service", "24/7 Cash Point"],
	dining: [
		"Airport Lounge Cafe",
		"Terminal Food Court",
		"Hotel Breakfast Buffet",
		"Beachfront Seafood Grill",
		"Old Quarter Street Food",
		"Night Market Food Stalls",
		"Resort Pool Bar",
	],
	groceries: [
		"Airport Convenience Store",
		"7-Eleven Travel Essentials",
		"FamilyMart Express",
		"Mini Mart Resort Shop",
		"Station Snack Store",
		"Hotel Pantry",
	],
	income: ["Payroll Credit", "Corporate Salary", "Monthly Salary Transfer"],
	ota_travel: OTA_TRAVEL_MERCHANTS,
	shopping: [
		"Duty Free Shopping",
		"Souvenir Market",
		"Airport Gift Shop",
		"Resort Boutique",
		"Theme Park Merchandise",
		"Outlet Mall Travel Store",
		"City Center Department Store",
	],
	travel: FAMOUS_PLACE_TRAVEL_MERCHANTS,
	transfer: ["Personal Transfer", "Interbank Transfer", "Account Top Up"],
	utilities: [
		"EVN Electricity",
		"VNPT Telecom",
		"Sawaco Water",
		"FPT Internet",
		"MoMo Bill Pay",
	],
} satisfies Record<BankingTransactionInfo["merchantCategory"], readonly string[]>

function gaussianRandom(): number {
	let u1 = 0
	let u2 = 0

	while (u1 <= Number.EPSILON) {
		u1 = faker.number.float()
	}

	while (u2 <= Number.EPSILON) {
		u2 = faker.number.float()
	}

	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

function formatMoney(value: number): string {
	return value.toFixed(2)
}

function startOfDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	)
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86_400_000)
}

function toIsoTimestamp(date: Date): string {
	return date.toISOString()
}

function cityIncomeMultiplier(city: string): number {
	switch (city) {
		case "Ho Chi Minh":
			return 1.25
		case "Ha Noi":
			return 1.2
		case "Hai Phong":
			return 0.95
		case "Da Nang":
			return 1
		default:
			return 1
	}
}

function weightedBankSample(
	preferredBanks: readonly BankName[],
	fallbackBanks: readonly BankName[],
	preferredWeight: number,
): BankName {
	const pool = weightedPoolChoice(preferredBanks, fallbackBanks, preferredWeight)
	return faker.helpers.arrayElement(pool)
}

function weightedPoolChoice<T>(
	preferredItems: readonly T[],
	fallbackItems: readonly T[],
	preferredWeight: number,
): readonly T[] {
	const roll = faker.number.float({ min: 0, max: 1 })
	return roll < preferredWeight ? preferredItems : fallbackItems
}

function weightedTravelMerchantCategory(): Extract<
	BankingTransactionInfo["merchantCategory"],
	"airline_ticket" | "ota_travel" | "travel"
> {
	const roll = faker.number.float({ min: 0, max: 1 })

	if (roll < 0.46) {
		return "ota_travel"
	}

	if (roll < 0.73) {
		return "travel"
	}

	return "airline_ticket"
}

function randomVietnamBiasedBank(): BankName {
	return weightedBankSample(VIETNAMESE_BANKS, FOREIGN_BANKS, 0.86)
}

function buildBankingUserProfile(
	resident: VietnameseResidentInfo,
): BankingUserProfile {
	const incomeNoise = clamp(gaussianRandom() * 0.18, -0.35, 0.5)
	const activityNoise = clamp(Math.abs(gaussianRandom()) * 0.45, 0, 1.4)
	const cityMultiplier = cityIncomeMultiplier(resident.city)
	const monthlyIncome = Math.round(
		(9_500_000 + 18_000_000 * (0.55 + incomeNoise)) * cityMultiplier,
	)
	const initialBalance = Math.max(
		2_000_000,
		Math.round(monthlyIncome * (1.1 + activityNoise)),
	)

	return {
		userId: resident.id,
		accountId: `ACC-${resident.id.slice(0, 8).toUpperCase()}`,
		city: resident.city,
		sourceBank: randomVietnamBiasedBank(),
		monthlyIncome,
		activityScore: 0.75 + activityNoise,
		initialBalance,
	}
}

function allocateTransactionCounts(
	profiles: BankingUserProfile[],
	totalCount: number,
): number[] {
	const totalScore = profiles.reduce((sum, profile) => sum + profile.activityScore, 0)
	const exactCounts = profiles.map(
		(profile) => (totalCount * profile.activityScore) / totalScore,
	)
	const counts = exactCounts.map((value) => Math.floor(value))
	let remainder = totalCount - counts.reduce((sum, count) => sum + count, 0)

	while (remainder > 0) {
		let bestIndex = 0
		let bestFraction = -1

		for (let index = 0; index < exactCounts.length; index += 1) {
			const fraction = (exactCounts[index] ?? 0) - (counts[index] ?? 0)
			if (fraction > bestFraction) {
				bestFraction = fraction
				bestIndex = index
			}
		}

		counts[bestIndex] = (counts[bestIndex] ?? 0) + 1
		remainder -= 1
	}

	return counts
}

function pickExpenseShape(
	dayOffset: number,
): Pick<
	BankingTransactionInfo,
	"channel" | "merchantCategory" | "transactionType"
> {
	const cycle = (Math.sin((2 * Math.PI * dayOffset) / 30) + 1) / 2
	const weekendBias = Math.cos((2 * Math.PI * dayOffset) / 7)

	if (cycle > 0.82) {
		return {
			transactionType: "transfer_out",
			channel: "mobile_app",
			merchantCategory: "utilities",
		}
	}

	if (cycle > 0.68) {
		return {
			transactionType: "card_payment",
			channel: "pos",
			merchantCategory: weightedTravelMerchantCategory(),
		}
	}

	if (weekendBias < -0.35) {
		return {
			transactionType: "card_payment",
			channel: "pos",
			merchantCategory: "shopping",
		}
	}

	if (cycle < 0.22) {
		return {
			transactionType: "cash_withdrawal",
			channel: "atm",
			merchantCategory: "cash",
		}
	}

	if (weekendBias > 0.45) {
		return {
			transactionType: "card_payment",
			channel: "pos",
			merchantCategory: "groceries",
		}
	}

	return {
		transactionType: "card_payment",
		channel: "pos",
		merchantCategory: "dining",
	}
}

function expenseAmount(
	profile: BankingUserProfile,
	transactionType: BankingTransactionInfo["transactionType"],
	dayOffset: number,
): number {
	const monthlyPulse = 0.85 + 0.3 * Math.sin((2 * Math.PI * dayOffset) / 30)
	const noise = clamp(1 + gaussianRandom() * 0.28, 0.35, 2.2)

	switch (transactionType) {
		case "cash_withdrawal":
			return Math.max(120_000, profile.monthlyIncome * 0.03 * monthlyPulse * noise)
		case "transfer_out":
			return Math.max(180_000, profile.monthlyIncome * 0.085 * monthlyPulse * noise)
		case "card_payment":
			return Math.max(45_000, profile.monthlyIncome * 0.018 * monthlyPulse * noise)
		default:
			return Math.max(50_000, profile.monthlyIncome * 0.02 * monthlyPulse * noise)
	}
}

function incomeAmount(
	profile: BankingUserProfile,
	transactionType: BankingTransactionInfo["transactionType"],
	dayOffset: number,
): number {
	const quarterPulse = 1 + 0.06 * Math.sin((2 * Math.PI * dayOffset) / 90)
	const noise = clamp(1 + gaussianRandom() * 0.04, 0.9, 1.12)

	if (transactionType === "salary") {
		return Math.max(5_000_000, profile.monthlyIncome * quarterPulse * noise)
	}

	return Math.max(
		250_000,
		profile.monthlyIncome * 0.12 * quarterPulse * clamp(1 + gaussianRandom() * 0.4, 0.3, 2),
	)
}

function randomCounterpartyBank(sourceBank: BankName): BankName {
	const alternatives = BANK_NAMES.filter((bank) => bank !== sourceBank)
	const preferredBanks = alternatives.filter((bank) =>
		VIETNAMESE_BANKS.includes(bank),
	)
	const fallbackBanks = alternatives.filter((bank) =>
		FOREIGN_BANKS.includes(bank),
	)

	if (VIETNAMESE_BANKS.includes(sourceBank)) {
		return weightedBankSample(preferredBanks, fallbackBanks, 0.82)
	}

	return weightedBankSample(preferredBanks, fallbackBanks, 0.62)
}

function merchantNameForCategory(
	category: BankingTransactionInfo["merchantCategory"],
): string {
	return faker.helpers.arrayElement(MERCHANT_NAMES[category])
}

function bankRoutingForTransaction(
	profile: BankingUserProfile,
	transactionType: BankingTransactionInfo["transactionType"],
	merchantCategory: BankingTransactionInfo["merchantCategory"],
): Pick<
	BankingTransactionInfo,
	"destinationBank" | "merchantName" | "sourceBank"
> {
	switch (transactionType) {
		case "salary":
			return {
				sourceBank: randomCounterpartyBank(profile.sourceBank),
				destinationBank: profile.sourceBank,
				merchantName: merchantNameForCategory("income"),
			}
		case "transfer_in":
			return {
				sourceBank: randomCounterpartyBank(profile.sourceBank),
				destinationBank: profile.sourceBank,
				merchantName: merchantNameForCategory("transfer"),
			}
		case "transfer_out":
			return {
				sourceBank: profile.sourceBank,
				destinationBank: randomCounterpartyBank(profile.sourceBank),
				merchantName: merchantNameForCategory("utilities"),
			}
		case "cash_withdrawal":
			return {
				sourceBank: profile.sourceBank,
				destinationBank: profile.sourceBank,
				merchantName: merchantNameForCategory("cash"),
			}
		case "card_payment":
			return {
				sourceBank: profile.sourceBank,
				destinationBank: randomCounterpartyBank(profile.sourceBank),
				merchantName: merchantNameForCategory(merchantCategory),
			}
		default:
			return {
				sourceBank: profile.sourceBank,
				destinationBank: profile.sourceBank,
				merchantName: merchantNameForCategory(merchantCategory),
			}
	}
}

function generateTransactionsForProfile(
	profile: BankingUserProfile,
	transactionCount: number,
): BankingTransactionInfo[] {
	const transactions: BankingTransactionInfo[] = []
	const today = startOfDay(new Date())
	const startDate = addDays(today, -180)
	let runningBalance = profile.initialBalance
	let previousDayOffset = 0
	const salaryMonths = new Set<string>()

	for (let index = 0; index < transactionCount; index += 1) {
		const progress = (index + 1) / (transactionCount + 1)
		const trendComponent = progress * 180
		const waveComponent =
			6 * Math.sin((2 * Math.PI * index) / Math.max(transactionCount, 6))
		const jitter = gaussianRandom() * 2.5
		const rawDayOffset = clamp(
			Math.round(trendComponent + waveComponent + jitter),
			0,
			179,
		)
		const dayOffset = Math.max(previousDayOffset, rawDayOffset)
		previousDayOffset = dayOffset
		const postedAt = addDays(startDate, dayOffset)
		postedAt.setUTCHours(
			faker.number.int({ min: 0, max: 23 }),
			faker.number.int({ min: 0, max: 59 }),
			faker.number.int({ min: 0, max: 59 }),
			0,
		)

		const dayOfMonth = postedAt.getUTCDate()
		const salaryMonthKey = `${postedAt.getUTCFullYear()}-${String(
			postedAt.getUTCMonth() + 1,
		).padStart(2, "0")}`
		const shouldPaySalary =
			dayOfMonth >= 25 &&
			dayOfMonth <= 28 &&
			!salaryMonths.has(salaryMonthKey)

		let transactionType: BankingTransactionInfo["transactionType"]
		let channel: BankingTransactionInfo["channel"]
		let merchantCategory: BankingTransactionInfo["merchantCategory"]
		let signedAmount = 0

		if (shouldPaySalary) {
			transactionType = "salary"
			channel = "branch"
			merchantCategory = "income"
			signedAmount = incomeAmount(profile, transactionType, dayOffset)
			salaryMonths.add(salaryMonthKey)
		} else {
			const shape = pickExpenseShape(dayOffset)
			transactionType = shape.transactionType
			channel = shape.channel
			merchantCategory = shape.merchantCategory
			signedAmount = -expenseAmount(profile, transactionType, dayOffset)

			if (runningBalance + signedAmount < profile.monthlyIncome * 0.15) {
				transactionType = "transfer_in"
				channel = "mobile_app"
				merchantCategory = "transfer"
				signedAmount = incomeAmount(profile, transactionType, dayOffset)
			}
		}

		const balanceBefore = runningBalance
		runningBalance = Math.max(0, runningBalance + signedAmount)
		const routing = bankRoutingForTransaction(
			profile,
			transactionType,
			merchantCategory,
		)

		transactions.push({
			transactionId: faker.string.uuid(),
			userId: profile.userId,
			accountId: profile.accountId,
			postedAt: toIsoTimestamp(postedAt),
			transactionType,
			channel,
			merchantCategory,
			amount: formatMoney(Math.abs(signedAmount)),
			currency: "VND",
			sourceBank: routing.sourceBank,
			destinationBank: routing.destinationBank,
			merchantName: routing.merchantName,
			balanceBefore: formatMoney(balanceBefore),
			balanceAfter: formatMoney(runningBalance),
			city: profile.city,
		})
	}

	return transactions
}

function bankingTransactionToCsvRow(transaction: BankingTransactionInfo): string {
	return `${BANKING_TRANSACTION_CSV_HEADERS.map((header) =>
		escapeCsv(String(transaction[header])),
	).join(",")}\n`
}

export async function streamBankingTransactionsToCsv(
	options: BankingTransactionGeneratorOptions,
): Promise<string> {
	if (options.seed !== undefined) {
		faker.seed(options.seed)
	}

	const residents = await readCsvRows<VietnameseResidentInfo>(options.residentsPath)

	if (residents.length === 0) {
		throw new Error(`No residents loaded from ${options.residentsPath}.`)
	}

	const profiles = residents.map(buildBankingUserProfile)
	const counts = allocateTransactionCounts(profiles, options.count)

	async function* rows() {
		for (let index = 0; index < profiles.length; index += 1) {
			const profile = profiles[index]
			if (!profile) {
				continue
			}

			const transactions = generateTransactionsForProfile(
				profile,
				counts[index] ?? 0,
			)

			for (const transaction of transactions) {
				yield transaction
			}
		}
	}

	return streamCsvRows(
		options.outputPath,
		BANKING_TRANSACTION_CSV_HEADERS,
		rows(),
		bankingTransactionToCsvRow,
	)
}
