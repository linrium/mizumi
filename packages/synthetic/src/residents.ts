import { createRequire } from "node:module"
import { fakerVI as faker } from "@faker-js/faker"
import { escapeCsv, streamCsvRows } from "./csv"
import {
	type GeneratorOptions,
	type Sex,
	RESIDENT_CSV_HEADERS,
	type VietnameseResidentInfo,
} from "./types"

interface AddressDatabaseProvince {
	province_code: string
	name: string
}

interface CityProfile {
	city: string
	sourceName: string
}

const require = createRequire(import.meta.url)
const vietnamAddressData = require("vietnam-address-database") as Array<{
	type: string
	name?: string
	data?: unknown
}>

const TARGET_CITY_CONFIGS: CityProfile[] = [
	{ city: "Ho Chi Minh", sourceName: "Thành phố Hồ Chí Minh" },
	{ city: "Ha Noi", sourceName: "Thành phố Hà Nội" },
	{ city: "Hai Phong", sourceName: "Thành phố Hải Phòng" },
	{ city: "Da Nang", sourceName: "Thành phố Đà Nẵng" },
]

function getAddressTable<T>(tableName: string): T[] {
	const table = vietnamAddressData.find(
		(item): item is { type: "table"; name: string; data: T[] } =>
			item.type === "table" && item.name === tableName && Array.isArray(item.data),
	)

	if (!table) {
		throw new Error(`Missing \`${tableName}\` table in vietnam-address-database.`)
	}

	return table.data
}

function buildCityProfiles(): CityProfile[] {
	const provinces = getAddressTable<AddressDatabaseProvince>("provinces")

	return TARGET_CITY_CONFIGS.map((config) => {
		const province = provinces.find((item) => item.name === config.sourceName)

		if (!province) {
			throw new Error(`Province not found for ${config.sourceName}.`)
		}

		return {
			city: config.city,
			sourceName: province.name,
		}
	})
}

const VIETNAMESE_LOCATIONS = buildCityProfiles()

function randomVietnamesePhoneNumber(): string {
	const prefix = faker.helpers.arrayElement(["03", "05", "07", "08", "09"])
	return `${prefix}${faker.string.numeric(8)}`
}

function randomNationalId(): string {
	return faker.string.numeric(12)
}

function randomLocation() {
	const location = faker.helpers.arrayElement(VIETNAMESE_LOCATIONS)

	return {
		city: location.city,
	}
}

export function generateVietnameseResident(): VietnameseResidentInfo {
	const sex = faker.helpers.arrayElement<Sex>(["female", "male"])
	const firstName = faker.person.firstName(sex)
	const lastName = faker.person.lastName(sex)
	const fullName = `${lastName} ${firstName}`
	const birthdate = faker.date.birthdate({ min: 18, max: 85, mode: "age" })

	return {
		id: faker.string.uuid(),
		fullName,
		sex,
		dateOfBirth: birthdate.toISOString().slice(0, 10),
		phoneNumber: randomVietnamesePhoneNumber(),
		email: faker.internet.email({ firstName, lastName }).toLowerCase(),
		nationalId: randomNationalId(),
		...randomLocation(),
	}
}

function residentToCsvRow(resident: VietnameseResidentInfo): string {
	return `${RESIDENT_CSV_HEADERS.map((header) =>
		escapeCsv(String(resident[header])),
	).join(",")}\n`
}

export async function streamVietnameseResidentsToCsv(
	options: GeneratorOptions,
): Promise<string> {
	if (options.seed !== undefined) {
		faker.seed(options.seed)
	}

	function* rows() {
		for (let index = 0; index < options.count; index += 1) {
			yield generateVietnameseResident()
		}
	}

	return streamCsvRows(
		options.outputPath,
		RESIDENT_CSV_HEADERS,
		rows(),
		residentToCsvRow,
	)
}
