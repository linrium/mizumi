import { copyFile, mkdir, readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fakerVI as faker } from "@faker-js/faker"
import { escapeCsv, readCsvRows, streamCsvRows } from "./csv"
import {
	FLIGHT_INCIDENT_CSV_HEADERS,
	type FlightIncidentGeneratorOptions,
	type FlightIncidentReportInfo,
	type FlightTicketInfo,
} from "./types"

interface EligibleTicket {
	ticket: FlightTicketInfo
	incidentScore: number
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

function airportIncidentBias(airport: string): number {
	switch (airport) {
		case "HAN":
			return 1.34
		case "SGN":
			return 1.31
		case "DAD":
			return 1.05
		case "HPH":
			return 0.96
		default:
			return 1
	}
}

function issueAirport(ticket: FlightTicketInfo): string {
	const roll = faker.number.float({ min: 0, max: 1 })

	if (roll < 0.46) {
		return ticket.originAirport
	}

	if (roll < 0.92) {
		return ticket.destinationAirport
	}

	return faker.helpers.arrayElement(["HAN", "SGN"])
}

function incidentTypeForAirport(
	airport: string,
): FlightIncidentReportInfo["incidentType"] {
	const roll = faker.number.float({ min: 0, max: 1 })

	if (airport === "HAN" || airport === "SGN") {
		if (roll < 0.36) {
			return "baggage_damaged"
		}
		if (roll < 0.56) {
			return "baggage_delayed"
		}
		if (roll < 0.76) {
			return "flight_delay"
		}
		if (roll < 0.86) {
			return "check_in_issue"
		}
		if (roll < 0.93) {
			return "rebooking_request"
		}
		return "seat_service_issue"
	}

	if (roll < 0.16) {
		return "baggage_damaged"
	}
	if (roll < 0.34) {
		return "baggage_delayed"
	}
	if (roll < 0.58) {
		return "flight_delay"
	}
	if (roll < 0.76) {
		return "check_in_issue"
	}
	if (roll < 0.9) {
		return "rebooking_request"
	}
	return "seat_service_issue"
}

function incidentSeverity(
	type: FlightIncidentReportInfo["incidentType"],
): FlightIncidentReportInfo["severity"] {
	switch (type) {
		case "baggage_damaged":
			return "high"
		case "baggage_delayed":
		case "flight_delay":
		case "rebooking_request":
			return "medium"
		default:
			return "low"
	}
}

function delayedMinutesForType(
	type: FlightIncidentReportInfo["incidentType"],
): number {
	if (type === "flight_delay") {
		return clamp(Math.round(45 + Math.abs(gaussianRandom()) * 85), 15, 360)
	}

	if (type === "baggage_delayed") {
		return clamp(Math.round(30 + Math.abs(gaussianRandom()) * 130), 10, 600)
	}

	return 0
}

function reportStatus(
	severity: FlightIncidentReportInfo["severity"],
): FlightIncidentReportInfo["status"] {
	const roll = faker.number.float({ min: 0, max: 1 })

	if (severity === "high") {
		return roll < 0.56 ? "in_review" : roll < 0.86 ? "resolved" : "closed"
	}

	return roll < 0.3 ? "in_review" : roll < 0.8 ? "resolved" : "closed"
}

function baggageTag(type: FlightIncidentReportInfo["incidentType"]): string {
	if (type !== "baggage_damaged" && type !== "baggage_delayed") {
		return ""
	}

	return `VJ${faker.string.numeric(8)}`
}

function reportedAtAfterDeparture(departureDate: string): string {
	const departure = new Date(departureDate)
	const reportDate = new Date(
		departure.getTime() +
			clamp(Math.round(Math.abs(gaussianRandom()) * 18), 1, 72) * 3_600_000,
	)
	return reportDate.toISOString()
}

function ticketIncidentScore(ticket: FlightTicketInfo): number {
	const airportBias =
		(airportIncidentBias(ticket.originAirport) +
			airportIncidentBias(ticket.destinationAirport)) /
		2
	const baggageFactor =
		ticket.baggageKg >= 30 ? 1.08 : ticket.baggageKg >= 20 ? 1 : 0.92
	const passengerFactor = 0.95 + ticket.passengerCount * 0.08
	const distanceFactor = clamp(ticket.distanceKm / 1800, 0.4, 3.6)
	const classFactor =
		ticket.cabinClass === "business"
			? 1.16
			: ticket.cabinClass === "premium_economy"
				? 1.08
				: 1
	const tripFactor = ticket.tripType === "round_trip" ? 1.1 : 1
	const priceFactor = clamp(
		Number.parseFloat(ticket.totalPrice) / 2_800_000,
		0.65,
		2.5,
	)
	const wave =
		0.92 +
		0.14 * Math.sin(Number.parseInt(ticket.ticketId.slice(0, 8), 16) / 4000)

	return clamp(
		(0.75 + distanceFactor * 0.24 + priceFactor * 0.18) *
			airportBias *
			baggageFactor *
			passengerFactor *
			classFactor *
			tripFactor *
			wave,
		0.1,
		6,
	)
}

function selectTicketsWithoutReplacement(
	tickets: EligibleTicket[],
	count: number,
): EligibleTicket[] {
	const pool = [...tickets]
	const selected: EligibleTicket[] = []

	while (pool.length > 0 && selected.length < count) {
		const totalScore = pool.reduce(
			(sum, ticket) => sum + ticket.incidentScore,
			0,
		)
		let threshold = faker.number.float({ min: 0, max: totalScore })
		let selectedIndex = 0

		for (let index = 0; index < pool.length; index += 1) {
			threshold -= pool[index]?.incidentScore ?? 0
			if (threshold <= 0) {
				selectedIndex = index
				break
			}
		}

		const picked = pool.splice(selectedIndex, 1)[0]
		if (picked) {
			selected.push(picked)
		}
	}

	return selected
}

function incidentToCsvRow(report: FlightIncidentReportInfo): string {
	return `${FLIGHT_INCIDENT_CSV_HEADERS.map((header) =>
		escapeCsv(String(report[header])),
	).join(",")}\n`
}

function makeImageCycler(filenames: string[]): () => string {
	let index = 0
	return () => {
		const filename = filenames[index % filenames.length] as string
		index += 1
		return `vietjetair/baggage_damaged_reports/${filename}`
	}
}

function buildIncidentReport(
	eligibleTicket: EligibleTicket,
	nextImage: (() => string) | null,
): FlightIncidentReportInfo {
	const airport = issueAirport(eligibleTicket.ticket)
	const type = incidentTypeForAirport(airport)
	const severity = incidentSeverity(type)

	return {
		reportId: faker.string.uuid(),
		vietjetCustomerId: eligibleTicket.ticket.userId,
		ticketId: eligibleTicket.ticket.ticketId,
		bookingReference: eligibleTicket.ticket.bookingReference,
		airline: "Vietjet Air",
		reportChannel: "vietjetair_app",
		incidentType: type,
		severity,
		issueAirport: airport,
		originAirport: eligibleTicket.ticket.originAirport,
		destinationAirport: eligibleTicket.ticket.destinationAirport,
		flightNumber: eligibleTicket.ticket.flightNumber,
		departureDate: eligibleTicket.ticket.departureAt,
		reportedAt: reportedAtAfterDeparture(eligibleTicket.ticket.departureAt),
		status: reportStatus(severity),
		baggageTag: baggageTag(type),
		delayedMinutes: delayedMinutesForType(type),
		currency: "VND",
		city: eligibleTicket.ticket.city,
		imagePath: type === "baggage_damaged" && nextImage ? nextImage() : "",
	}
}

export function generateFlightIncidents(
	tickets: FlightTicketInfo[],
	count: number,
	seed?: number,
): FlightIncidentReportInfo[] {
	if (seed !== undefined) {
		faker.seed(seed)
	}

	const eligibleTickets = tickets
		.filter((ticket) => ticket.airline === "Vietjet Air")
		.map((ticket) => ({
			ticket,
			incidentScore: ticketIncidentScore(ticket),
		}))

	if (eligibleTickets.length === 0) {
		return []
	}

	const selectedTickets = selectTicketsWithoutReplacement(
		eligibleTickets,
		Math.min(count, eligibleTickets.length),
	)

	return selectedTickets.map((eligibleTicket) =>
		buildIncidentReport(eligibleTicket, null),
	)
}

export async function streamFlightIncidentsToCsv(
	options: FlightIncidentGeneratorOptions,
): Promise<string> {
	if (options.seed !== undefined) {
		faker.seed(options.seed)
	}

	const tickets = await readCsvRows<FlightTicketInfo>(options.flightTicketsPath)

	if (tickets.length === 0) {
		throw new Error(
			`No flight tickets loaded from ${options.flightTicketsPath}.`,
		)
	}

	const eligibleTickets = tickets
		.filter((ticket) => ticket.airline === "Vietjet Air")
		.map((ticket) => ({
			ticket,
			incidentScore: ticketIncidentScore(ticket),
		}))

	if (eligibleTickets.length === 0) {
		throw new Error(
			`No Vietjet Air tickets loaded from ${options.flightTicketsPath}.`,
		)
	}

	const selectedTickets = selectTicketsWithoutReplacement(
		eligibleTickets,
		Math.min(options.count, eligibleTickets.length),
	)

	let nextImage: (() => string) | null = null
	if (options.trainDataPath) {
		const trainDataPath = resolve(options.trainDataPath)
		const filenames = (await readdir(trainDataPath)).filter((filename) =>
			/\.(?:jpg|jpeg|png|webp)$/i.test(filename),
		)
		if (filenames.length === 0) {
			throw new Error(
				`No baggage damage images found in ${options.trainDataPath}.`,
			)
		}
		const outputImageDir = resolve(
			dirname(options.outputPath),
			"baggage_damaged_reports",
		)
		await mkdir(outputImageDir, { recursive: true })
		await Promise.all(
			filenames.map((filename) =>
				copyFile(
					resolve(trainDataPath, filename),
					resolve(outputImageDir, filename),
				),
			),
		)
		const shuffled = faker.helpers.shuffle(filenames)
		nextImage = makeImageCycler(shuffled)
	}

	function* rows() {
		for (const ticket of selectedTickets) {
			yield buildIncidentReport(ticket, nextImage)
		}
	}

	return streamCsvRows(
		options.outputPath,
		FLIGHT_INCIDENT_CSV_HEADERS,
		rows(),
		incidentToCsvRow,
	)
}
