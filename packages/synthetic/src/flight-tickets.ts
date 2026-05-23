import { fakerVI as faker } from "@faker-js/faker"
import { escapeCsv, readCsvRows, streamCsvRows } from "./csv"
import {
	FLIGHT_TICKET_CSV_HEADERS,
	type FlightTicketGeneratorOptions,
	type FlightTicketInfo,
	type VietnameseResidentInfo,
} from "./types"

type CabinClass = FlightTicketInfo["cabinClass"]

interface AirportRoute {
	originAirport: string
	destinationAirport: string
	destinationCity: string
	distanceKm: number
	durationMinutes: number
	eligibleAirlines: readonly string[]
}

interface FlightTravelProfile {
	userId: string
	city: string
	travelScore: number
}

const HOME_AIRPORT_BY_CITY = {
	"Da Nang": "DAD",
	"Ha Noi": "HAN",
	"Hai Phong": "HPH",
	"Ho Chi Minh": "SGN",
} as const

const HIGH_COST_AIRLINE_MULTIPLIER: Record<string, number> = {
	"All Nippon Airways": 1.42,
	"American Airlines": 1.28,
	"Asiana Airlines": 1.22,
	"Delta Air Lines": 1.29,
	"Japan Airlines": 1.4,
	"Korean Air": 1.3,
	"Singapore Airlines": 1.44,
	"United Airlines": 1.27,
	"Vietnam Airlines": 1.17,
}

const LOW_COST_AIRLINE_MULTIPLIER: Record<string, number> = {
	"Air Premia": 0.98,
	"Agoda": 1,
	"Bamboo Airways": 0.94,
	"Jeju Air": 0.83,
	"Jetstar Japan": 0.8,
	"Jin Air": 0.82,
	"Pacific Airlines": 0.86,
	"Peach Aviation": 0.78,
	"Scoot": 0.81,
	"Spring Airlines": 0.79,
	"T'way Air": 0.8,
	"Vietjet Air": 0.72,
	"Vasco": 0.88,
}

const CABIN_CLASS_MULTIPLIER: Record<CabinClass, number> = {
	business: 2.6,
	economy: 1,
	premium_economy: 1.45,
}

const AIRLINE_CODE: Record<string, string> = {
	"Air China": "CA",
	"All Nippon Airways": "NH",
	"Alaska Airlines": "AS",
	"American Airlines": "AA",
	"Asiana Airlines": "OZ",
	"Air Premia": "YP",
	"Bamboo Airways": "QH",
	"China Eastern Airlines": "MU",
	"China Southern Airlines": "CZ",
	"Delta Air Lines": "DL",
	"Hainan Airlines": "HU",
	"Japan Airlines": "JL",
	"Jeju Air": "7C",
	"JetBlue Airways": "B6",
	"Jetstar Japan": "GK",
	"Jin Air": "LJ",
	"Korean Air": "KE",
	"Pacific Airlines": "BL",
	"Peach Aviation": "MM",
	"Shenzhen Airlines": "ZH",
	"Sichuan Airlines": "3U",
	"Singapore Airlines": "SQ",
	"Skymark Airlines": "BC",
	"Scoot": "TR",
	"Spring Airlines": "9C",
	"T'way Air": "TW",
	"United Airlines": "UA",
	"Vasco": "0V",
	"Vietnam Airlines": "VN",
	"Vietjet Air": "VJ",
}

const REGIONAL_AIRLINES = [
	"Vietnam Airlines",
	"Vietjet Air",
	"Bamboo Airways",
	"Pacific Airlines",
	"Vasco",
	"Singapore Airlines",
	"Scoot",
	"Air China",
	"China Southern Airlines",
	"China Eastern Airlines",
	"Hainan Airlines",
	"Shenzhen Airlines",
	"Sichuan Airlines",
	"Spring Airlines",
	"Japan Airlines",
	"All Nippon Airways",
	"Peach Aviation",
	"Jetstar Japan",
	"Skymark Airlines",
	"Korean Air",
	"Asiana Airlines",
	"Jeju Air",
	"Jin Air",
	"T'way Air",
	"Air Premia",
] as const

const NORTH_AMERICA_AIRLINES = [
	"United Airlines",
	"Delta Air Lines",
	"American Airlines",
	"Alaska Airlines",
	"Hawaiian Airlines",
	"JetBlue Airways",
	"Japan Airlines",
	"All Nippon Airways",
	"Korean Air",
	"Asiana Airlines",
	"Singapore Airlines",
] as const

const AIRPORT_ROUTES: Record<string, AirportRoute[]> = {
	DAD: [
		{
			originAirport: "DAD",
			destinationAirport: "SGN",
			destinationCity: "Ho Chi Minh",
			distanceKm: 610,
			durationMinutes: 85,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
				"Pacific Airlines",
			],
		},
		{
			originAirport: "DAD",
			destinationAirport: "HAN",
			destinationCity: "Ha Noi",
			distanceKm: 628,
			durationMinutes: 82,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
			],
		},
		{
			originAirport: "DAD",
			destinationAirport: "SIN",
			destinationCity: "Singapore",
			distanceKm: 1628,
			durationMinutes: 165,
			eligibleAirlines: ["Vietjet Air", "Singapore Airlines", "Scoot"],
		},
		{
			originAirport: "DAD",
			destinationAirport: "ICN",
			destinationCity: "Seoul",
			distanceKm: 3008,
			durationMinutes: 265,
			eligibleAirlines: [
				"Vietjet Air",
				"Korean Air",
				"Asiana Airlines",
				"Jeju Air",
			],
		},
	],
	HAN: [
		{
			originAirport: "HAN",
			destinationAirport: "SGN",
			destinationCity: "Ho Chi Minh",
			distanceKm: 1160,
			durationMinutes: 130,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
			],
		},
		{
			originAirport: "HAN",
			destinationAirport: "DAD",
			destinationCity: "Da Nang",
			distanceKm: 628,
			durationMinutes: 82,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
			],
		},
		{
			originAirport: "HAN",
			destinationAirport: "NRT",
			destinationCity: "Tokyo",
			distanceKm: 3695,
			durationMinutes: 305,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Japan Airlines",
				"All Nippon Airways",
			],
		},
		{
			originAirport: "HAN",
			destinationAirport: "PVG",
			destinationCity: "Shanghai",
			distanceKm: 2732,
			durationMinutes: 245,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Air China",
				"China Eastern Airlines",
				"China Southern Airlines",
			],
		},
		{
			originAirport: "HAN",
			destinationAirport: "SIN",
			destinationCity: "Singapore",
			distanceKm: 2217,
			durationMinutes: 205,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Singapore Airlines",
				"Scoot",
			],
		},
	],
	HPH: [
		{
			originAirport: "HPH",
			destinationAirport: "SGN",
			destinationCity: "Ho Chi Minh",
			distanceKm: 1127,
			durationMinutes: 125,
			eligibleAirlines: ["Vietnam Airlines", "Vietjet Air"],
		},
		{
			originAirport: "HPH",
			destinationAirport: "DAD",
			destinationCity: "Da Nang",
			distanceKm: 556,
			durationMinutes: 80,
			eligibleAirlines: ["Vietnam Airlines", "Vietjet Air"],
		},
		{
			originAirport: "HPH",
			destinationAirport: "BKK",
			destinationCity: "Bangkok",
			distanceKm: 919,
			durationMinutes: 110,
			eligibleAirlines: ["Vietjet Air", "Vietnam Airlines"],
		},
		{
			originAirport: "HPH",
			destinationAirport: "ICN",
			destinationCity: "Seoul",
			distanceKm: 2718,
			durationMinutes: 240,
			eligibleAirlines: [
				"Vietjet Air",
				"Korean Air",
				"Asiana Airlines",
				"Jeju Air",
			],
		},
	],
	SGN: [
		{
			originAirport: "SGN",
			destinationAirport: "HAN",
			destinationCity: "Ha Noi",
			distanceKm: 1160,
			durationMinutes: 130,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
			],
		},
		{
			originAirport: "SGN",
			destinationAirport: "DAD",
			destinationCity: "Da Nang",
			distanceKm: 610,
			durationMinutes: 85,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Bamboo Airways",
			],
		},
		{
			originAirport: "SGN",
			destinationAirport: "SIN",
			destinationCity: "Singapore",
			distanceKm: 1097,
			durationMinutes: 120,
			eligibleAirlines: [
				"Vietjet Air",
				"Vietnam Airlines",
				"Singapore Airlines",
				"Scoot",
			],
		},
		{
			originAirport: "SGN",
			destinationAirport: "NRT",
			destinationCity: "Tokyo",
			distanceKm: 4336,
			durationMinutes: 355,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Japan Airlines",
				"All Nippon Airways",
			],
		},
		{
			originAirport: "SGN",
			destinationAirport: "ICN",
			destinationCity: "Seoul",
			distanceKm: 3598,
			durationMinutes: 300,
			eligibleAirlines: [
				"Vietnam Airlines",
				"Vietjet Air",
				"Korean Air",
				"Asiana Airlines",
				"Jeju Air",
				"Jin Air",
			],
		},
		{
			originAirport: "SGN",
			destinationAirport: "LAX",
			destinationCity: "Los Angeles",
			distanceKm: 13140,
			durationMinutes: 930,
			eligibleAirlines: [
				"United Airlines",
				"Delta Air Lines",
				"American Airlines",
				"Japan Airlines",
				"All Nippon Airways",
				"Singapore Airlines",
				"Korean Air",
			],
		},
	],
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

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

function hashString(input: string): number {
	let hash = 0

	for (let index = 0; index < input.length; index += 1) {
		hash = (hash * 33 + input.charCodeAt(index)) % 1_000_003
	}

	return hash
}

function weightedAirlineSelection(eligibleAirlines: readonly string[]): string {
	const roll = faker.number.float({ min: 0, max: 1 })
	const hasVietjet = eligibleAirlines.includes("Vietjet Air")

	if (hasVietjet && roll < 0.36) {
		return "Vietjet Air"
	}

	if (roll < 0.7) {
		const regional = eligibleAirlines.filter((airline) =>
			REGIONAL_AIRLINES.includes(airline as (typeof REGIONAL_AIRLINES)[number]),
		)
		if (regional.length > 0) {
			return faker.helpers.arrayElement(regional)
		}
	}

	if (roll > 0.9) {
		const longHaul = eligibleAirlines.filter((airline) =>
			NORTH_AMERICA_AIRLINES.includes(
				airline as (typeof NORTH_AMERICA_AIRLINES)[number],
			),
		)
		if (longHaul.length > 0) {
			return faker.helpers.arrayElement(longHaul)
		}
	}

	return faker.helpers.arrayElement([...eligibleAirlines])
}

function cityTravelBias(city: string): number {
	switch (city) {
		case "Ho Chi Minh":
			return 1.22
		case "Ha Noi":
			return 1.18
		case "Da Nang":
			return 1.06
		case "Hai Phong":
			return 0.94
		default:
			return 1
	}
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

function buildTravelProfile(resident: VietnameseResidentInfo): FlightTravelProfile {
	const age = ageFromDateOfBirth(resident.dateOfBirth)
	const hash = hashString(`${resident.id}:${resident.city}:flight`)
	const normalized = hash / 1_000_003
	const ageCurve = 1 - Math.abs(age - 33) / 24
	const wave = Math.sin(normalized * Math.PI * 8) * 0.24
	const score = clamp(
		0.72 + cityTravelBias(resident.city) * (0.38 + ageCurve * 0.22 + wave),
		0.25,
		2.5,
	)

	return {
		userId: resident.id,
		city: resident.city,
		travelScore: score,
	}
}

function allocateTicketCounts(
	profiles: FlightTravelProfile[],
	totalCount: number,
): number[] {
	const totalScore = profiles.reduce((sum, profile) => sum + profile.travelScore, 0)
	const exactCounts = profiles.map(
		(profile) => (totalCount * profile.travelScore) / totalScore,
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

function airlinePriceMultiplier(airline: string): number {
	if (airline in HIGH_COST_AIRLINE_MULTIPLIER) {
		return HIGH_COST_AIRLINE_MULTIPLIER[airline] ?? 1
	}

	if (airline in LOW_COST_AIRLINE_MULTIPLIER) {
		return LOW_COST_AIRLINE_MULTIPLIER[airline] ?? 1
	}

	return 1
}

function chooseCabinClass(airline: string, distanceKm: number): CabinClass {
	const roll = faker.number.float({ min: 0, max: 1 })

	if (distanceKm > 3500 && airlinePriceMultiplier(airline) > 1.2 && roll < 0.2) {
		return "business"
	}

	if (distanceKm > 2500 && roll < 0.34) {
		return "premium_economy"
	}

	return "economy"
}

function tripType(distanceKm: number): FlightTicketInfo["tripType"] {
	const roll = faker.number.float({ min: 0, max: 1 })
	return distanceKm > 3000 ? (roll < 0.6 ? "round_trip" : "one_way") : roll < 0.4
			? "round_trip"
			: "one_way"
}

function passengerCount(): number {
	const roll = faker.number.float({ min: 0, max: 1 })
	if (roll < 0.7) {
		return 1
	}
	if (roll < 0.92) {
		return 2
	}
	return 3
}

function baggageKg(airline: string, cabinClass: CabinClass): number {
	if (cabinClass === "business") {
		return 40
	}
	if (cabinClass === "premium_economy") {
		return 30
	}
	return airline === "Vietjet Air" ? 20 : 23
}

function randomFutureDeparture(): { bookingAt: Date; departureAt: Date } {
	const bookingAt = new Date()
	const leadDays = clamp(
		Math.round(18 + 22 * Math.sin(faker.number.float({ min: 0, max: Math.PI })) + gaussianRandom() * 8),
		2,
		120,
	)
	const departureAt = new Date(bookingAt.getTime() + leadDays * 86_400_000)
	departureAt.setUTCHours(
		faker.number.int({ min: 0, max: 23 }),
		faker.number.int({ min: 0, max: 59 }),
		0,
		0,
	)
	return { bookingAt, departureAt }
}

function priceTicket(
	airline: string,
	route: AirportRoute,
	cabinClass: CabinClass,
	passengers: number,
	bookingLeadDays: number,
	departureAt: Date,
): { baseFare: number; taxes: number; totalPrice: number } {
	const distanceFactor = route.distanceKm * 880
	const airlineFactor = airlinePriceMultiplier(airline)
	const cabinFactor = CABIN_CLASS_MULTIPLIER[cabinClass]
	const seasonality =
		1 +
		0.12 *
			Math.sin((2 * Math.PI * (departureAt.getUTCMonth() + 1)) / 12) +
		0.05 * Math.cos((2 * Math.PI * departureAt.getUTCDate()) / 31)
	const advancePurchaseFactor = clamp(1.24 - bookingLeadDays / 190, 0.78, 1.22)
	const noise = clamp(1 + gaussianRandom() * 0.08, 0.86, 1.24)
	const passengerFactor = 0.92 + passengers * 0.08
	const baseFare =
		distanceFactor *
		airlineFactor *
		cabinFactor *
		seasonality *
		advancePurchaseFactor *
		noise *
		passengerFactor
	const taxes = baseFare * (0.12 + route.distanceKm / 30_000)
	const totalPrice = baseFare + taxes

	return {
		baseFare: Math.round(baseFare),
		taxes: Math.round(taxes),
		totalPrice: Math.round(totalPrice),
	}
}

function flightNumber(airline: string): string {
	const code = AIRLINE_CODE[airline] ?? "XX"
	return `${code}${faker.number.int({ min: 100, max: 9999 })}`
}

function bookingReference(): string {
	return faker.string.alphanumeric({ casing: "upper", length: 6 })
}

function formatMoney(value: number): string {
	return value.toFixed(2)
}

function generateTicketsForResident(
	resident: VietnameseResidentInfo,
	ticketCount: number,
): FlightTicketInfo[] {
	const tickets: FlightTicketInfo[] = []
	const originAirport = HOME_AIRPORT_BY_CITY[
		resident.city as keyof typeof HOME_AIRPORT_BY_CITY
	]
	const routes = AIRPORT_ROUTES[originAirport]

	if (!routes || ticketCount <= 0) {
		return tickets
	}

	for (let index = 0; index < ticketCount; index += 1) {
		const route = faker.helpers.arrayElement(routes)
		const airline = weightedAirlineSelection(route.eligibleAirlines)
		const cabinClass = chooseCabinClass(airline, route.distanceKm)
		const passengers = passengerCount()
		const trip = tripType(route.distanceKm)
		const { bookingAt, departureAt } = randomFutureDeparture()
		const leadDays = Math.max(
			1,
			Math.round(
				(departureAt.getTime() - bookingAt.getTime()) / 86_400_000,
			),
		)
		const returnDepartureAt =
			trip === "round_trip"
				? new Date(
						departureAt.getTime() +
							clamp(
								Math.round(3 + 9 * faker.number.float() + gaussianRandom() * 2),
								2,
								16,
							) *
								86_400_000,
					)
				: null
		const pricing = priceTicket(
			airline,
			route,
			cabinClass,
			passengers,
			leadDays,
			departureAt,
		)

		tickets.push({
			ticketId: faker.string.uuid(),
			userId: resident.id,
			bookingReference: bookingReference(),
			airline,
			flightNumber: flightNumber(airline),
			tripType: trip,
			originAirport: route.originAirport,
			destinationAirport: route.destinationAirport,
			bookingAt: bookingAt.toISOString(),
			departureAt: departureAt.toISOString(),
			returnDepartureAt: returnDepartureAt ? returnDepartureAt.toISOString() : "",
			cabinClass,
			passengerCount: passengers,
			distanceKm: route.distanceKm,
			flightDurationMinutes: route.durationMinutes,
			baseFare: formatMoney(pricing.baseFare),
			taxes: formatMoney(pricing.taxes),
			totalPrice: formatMoney(pricing.totalPrice),
			currency: "VND",
			baggageKg: baggageKg(airline, cabinClass),
			status: leadDays > 7 ? "ticketed" : leadDays > 2 ? "booked" : "completed",
			city: resident.city,
		})
	}

	return tickets
}

function flightTicketToCsvRow(ticket: FlightTicketInfo): string {
	return `${FLIGHT_TICKET_CSV_HEADERS.map((header) =>
		escapeCsv(String(ticket[header])),
	).join(",")}\n`
}

export async function streamFlightTicketsToCsv(
	options: FlightTicketGeneratorOptions,
): Promise<string> {
	if (options.seed !== undefined) {
		faker.seed(options.seed)
	}

	const residents = await readCsvRows<VietnameseResidentInfo>(options.residentsPath)

	if (residents.length === 0) {
		throw new Error(`No residents loaded from ${options.residentsPath}.`)
	}

	const profiles = residents.map(buildTravelProfile)
	const counts = allocateTicketCounts(profiles, options.count)

	async function* rows() {
		for (let index = 0; index < residents.length; index += 1) {
			const resident = residents[index]
			if (!resident) {
				continue
			}

			const tickets = generateTicketsForResident(resident, counts[index] ?? 0)
			for (const ticket of tickets) {
				yield ticket
			}
		}
	}

	return streamCsvRows(
		options.outputPath,
		FLIGHT_TICKET_CSV_HEADERS,
		rows(),
		flightTicketToCsvRow,
	)
}
