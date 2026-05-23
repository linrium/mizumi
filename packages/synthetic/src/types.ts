export type Sex = "female" | "male"

export interface GeneratorOptions {
	count: number
	outputPath: string
	seed?: number
}

export interface BankingTransactionGeneratorOptions extends GeneratorOptions {
	residentsPath: string
}

export interface BrandCustomerGeneratorOptions extends GeneratorOptions {
	residentsPath: string
}

export interface FlightTicketGeneratorOptions extends GeneratorOptions {
	residentsPath: string
}

export interface FlightIncidentGeneratorOptions extends GeneratorOptions {
	flightTicketsPath: string
}

export interface CliOptions {
	command:
		| "banking-transactions"
		| "brand-customers"
		| "flight-incidents"
		| "flight-tickets"
		| "vietnamese-residents"
	options:
		| BankingTransactionGeneratorOptions
		| BrandCustomerGeneratorOptions
		| FlightIncidentGeneratorOptions
		| FlightTicketGeneratorOptions
		| GeneratorOptions
}

export interface VietnameseResidentInfo {
	id: string
	fullName: string
	sex: Sex
	dateOfBirth: string
	phoneNumber: string
	email: string
	nationalId: string
	city: string
}

export type BankName =
	| "agribank"
	| "bidv"
	| "citibank"
	| "hdbank"
	| "mufg"
	| "oub"
	| "shinhan"
	| "smbc"
	| "techcombank"
	| "vietcombank"
	| "vietinbank"

export interface BankingTransactionInfo {
	transactionId: string
	userId: string
	accountId: string
	postedAt: string
	transactionType:
		| "card_payment"
		| "cash_withdrawal"
		| "salary"
		| "transfer_in"
		| "transfer_out"
	channel: "atm" | "branch" | "mobile_app" | "pos"
	merchantCategory:
		| "airline_ticket"
		| "cash"
		| "dining"
		| "groceries"
		| "income"
		| "ota_travel"
		| "shopping"
		| "travel"
		| "transfer"
		| "utilities"
	amount: string
	currency: "VND"
	sourceBank: BankName
	destinationBank: BankName
	merchantName: string
	balanceBefore: string
	balanceAfter: string
	city: string
}

export interface FlightTicketInfo {
	ticketId: string
	userId: string
	bookingReference: string
	airline: string
	flightNumber: string
	tripType: "one_way" | "round_trip"
	originAirport: string
	destinationAirport: string
	bookingAt: string
	departureAt: string
	returnDepartureAt: string
	cabinClass: "business" | "economy" | "premium_economy"
	passengerCount: number
	distanceKm: number
	flightDurationMinutes: number
	baseFare: string
	taxes: string
	totalPrice: string
	currency: "VND"
	baggageKg: number
	status: "booked" | "completed" | "ticketed"
	city: string
}

export interface FlightIncidentReportInfo {
	reportId: string
	vietjetCustomerId: string
	ticketId: string
	bookingReference: string
	airline: "Vietjet Air"
	reportChannel: "vietjetair_app"
	incidentType:
		| "baggage_damaged"
		| "baggage_delayed"
		| "check_in_issue"
		| "flight_delay"
		| "rebooking_request"
		| "seat_service_issue"
	severity: "high" | "low" | "medium"
	issueAirport: string
	originAirport: string
	destinationAirport: string
	flightNumber: string
	departureDate: string
	reportedAt: string
	status: "closed" | "in_review" | "resolved"
	baggageTag: string
	delayedMinutes: number
	currency: "VND"
	city: string
}

export type CustomerCase =
	| "both_hdbank_and_vietjetair"
	| "only_hdbank"
	| "only_vietjetair"

export interface HdbankCustomerInfo {
	userId: string
	fullName: string
	city: string
	age: number
	customerCase: Extract<
		CustomerCase,
		"both_hdbank_and_vietjetair" | "only_hdbank"
	>
	customerTier: "diamond" | "gold" | "platinum" | "standard"
	hdbankAffinityScore: string
	averageMonthlyBalance: string
	creditScoreBand: "A" | "B" | "C"
	hdbankSince: string
	hasVietjetCoBrandCard: "true" | "false"
}

export interface VietjetAirCustomerInfo {
	userId: string
	fullName: string
	city: string
	age: number
	customerCase: Extract<
		CustomerCase,
		"both_hdbank_and_vietjetair" | "only_vietjetair"
	>
	skybossTier: "eco" | "gold" | "platinum" | "skyboss"
	vietjetAirAffinityScore: string
	annualFlights: number
	ancillarySpendScore: string
	vietjetAirSince: string
	hasHdbankCoBrandCard: "true" | "false"
}

export const RESIDENT_CSV_HEADERS: Array<keyof VietnameseResidentInfo> = [
	"id",
	"fullName",
	"sex",
	"dateOfBirth",
	"phoneNumber",
	"email",
	"nationalId",
	"city",
]

export const BANKING_TRANSACTION_CSV_HEADERS: Array<
	keyof BankingTransactionInfo
> = [
	"transactionId",
	"userId",
	"accountId",
	"postedAt",
	"transactionType",
	"channel",
	"merchantCategory",
	"amount",
	"currency",
	"sourceBank",
	"destinationBank",
	"merchantName",
	"balanceBefore",
	"balanceAfter",
	"city",
]

export const FLIGHT_TICKET_CSV_HEADERS: Array<keyof FlightTicketInfo> = [
	"ticketId",
	"userId",
	"bookingReference",
	"airline",
	"flightNumber",
	"tripType",
	"originAirport",
	"destinationAirport",
	"bookingAt",
	"departureAt",
	"returnDepartureAt",
	"cabinClass",
	"passengerCount",
	"distanceKm",
	"flightDurationMinutes",
	"baseFare",
	"taxes",
	"totalPrice",
	"currency",
	"baggageKg",
	"status",
	"city",
]

export const FLIGHT_INCIDENT_CSV_HEADERS: Array<
	keyof FlightIncidentReportInfo
> = [
	"reportId",
	"vietjetCustomerId",
	"ticketId",
	"bookingReference",
	"airline",
	"reportChannel",
	"incidentType",
	"severity",
	"issueAirport",
	"originAirport",
	"destinationAirport",
	"flightNumber",
	"departureDate",
	"reportedAt",
	"status",
	"baggageTag",
	"delayedMinutes",
	"currency",
	"city",
]

export const HDBANK_CUSTOMER_CSV_HEADERS: Array<keyof HdbankCustomerInfo> = [
	"userId",
	"fullName",
	"city",
	"age",
	"customerCase",
	"customerTier",
	"hdbankAffinityScore",
	"averageMonthlyBalance",
	"creditScoreBand",
	"hdbankSince",
	"hasVietjetCoBrandCard",
]

export const VIETJETAIR_CUSTOMER_CSV_HEADERS: Array<
	keyof VietjetAirCustomerInfo
> = [
	"userId",
	"fullName",
	"city",
	"age",
	"customerCase",
	"skybossTier",
	"vietjetAirAffinityScore",
	"annualFlights",
	"ancillarySpendScore",
	"vietjetAirSince",
	"hasHdbankCoBrandCard",
]
