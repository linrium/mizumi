import { once } from "node:events"
import { createWriteStream } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

export function escapeCsv(value: string): string {
	if (/[",\n]/.test(value)) {
		return `"${value.replaceAll('"', '""')}"`
	}

	return value
}

export function csvLineToValues(line: string): string[] {
	const values: string[] = []
	let current = ""
	let inQuotes = false

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index]
		const nextChar = line[index + 1]

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				current += '"'
				index += 1
				continue
			}

			inQuotes = !inQuotes
			continue
		}

		if (char === "," && !inQuotes) {
			values.push(current)
			current = ""
			continue
		}

		current += char
	}

	values.push(current)
	return values
}

export async function readCsvRows<T>(filePath: string): Promise<T[]> {
	const csv = await readFile(resolve(filePath), "utf8")
	const lines = csv.trim().split(/\r?\n/)

	if (lines.length < 2) {
		throw new Error(`No CSV rows found in ${filePath}.`)
	}

	const [headerLine, ...dataLines] = lines
	if (!headerLine) {
		throw new Error(`Missing CSV headers in ${filePath}.`)
	}

	const headers = csvLineToValues(headerLine)

	return dataLines.map((line) => {
		const values = csvLineToValues(line)
		const row = Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""]),
		)

		return row as unknown as T
	})
}

export async function streamCsvRows<T>(
	outputPathInput: string,
	headers: string[],
	rows: AsyncIterable<T> | Iterable<T>,
	toRow: (row: T) => string,
): Promise<string> {
	const outputPath = resolve(outputPathInput)
	await mkdir(dirname(outputPath), { recursive: true })

	const stream = createWriteStream(outputPath, { encoding: "utf8" })
	stream.write(`${headers.join(",")}\n`)

	for await (const row of rows) {
		if (!stream.write(toRow(row))) {
			await once(stream, "drain")
		}
	}

	stream.end()
	await once(stream, "finish")

	return outputPath
}
