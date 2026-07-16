import { parseArgs as parseNodeArgs } from "node:util";

type JsonRow = Record<string, unknown>;

type Options = {
  host: string;
  user?: string;
  password?: string;
  service: string;
  hours: number;
  limit: number;
  kind: "all" | "summary" | "traces" | "errors" | "logs" | "services";
};

const DEFAULT_HOST = "http://127.0.0.1:8123";
const TRACE_SERVICE_COLUMN = "serviceName";

type Signal = "traces" | "logs";
type TagScope = "resource" | "attribute";

function usage(): never {
  console.log(`Query SigNoz ClickHouse observability data.

Usage:
  bun run scratches/ch-query/main.ts [options]

Options:
  --service <name>   Service name to query. Default: controlplane
  --hours <n>        Lookback window in hours. Default: 24
  --limit <n>        Row limit for detail queries. Default: 20
  --kind <kind>      all | summary | traces | errors | logs | services. Default: all
  --host <url>       ClickHouse HTTP URL. Default: ${DEFAULT_HOST}
  --user <name>      ClickHouse user. Also supports CH_USER env var.
  --password <pw>    ClickHouse password. Also supports CH_PASSWORD env var.
  --help             Show this help.

Examples:
  bun run scratches/ch-query/main.ts
  bun run scratches/ch-query/main.ts --service controlplane --hours 6
  bun run scratches/ch-query/main.ts --kind traces --limit 50
  CH_HOST=http://127.0.0.1:8123 bun run scratches/ch-query/main.ts --kind services
`);
  process.exit(0);
}

function parseOptions(argv: string[]): Options {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      service: { type: "string", short: "s" },
      hours: { type: "string" },
      limit: { type: "string", short: "n" },
      kind: { type: "string" },
      host: { type: "string" },
      user: { type: "string" },
      password: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) usage();

  return {
    host: process.env.CH_HOST ?? DEFAULT_HOST,
    user: process.env.CH_USER,
    password: process.env.CH_PASSWORD,
    service: "controlplane",
    hours: 24,
    limit: 20,
    kind: "all",
    ...(values.host ? { host: values.host } : {}),
    ...(values.user ? { user: values.user } : {}),
    ...(values.password ? { password: values.password } : {}),
    ...(values.service ? { service: values.service } : {}),
    ...(values.hours ? { hours: parsePositiveInt(values.hours, "--hours") } : {}),
    ...(values.limit ? { limit: parsePositiveInt(values.limit, "--limit") } : {}),
    ...(values.kind ? { kind: parseKind(values.kind) } : {}),
  };
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseKind(value: string): Options["kind"] {
  const kinds = ["all", "summary", "traces", "errors", "logs", "services"] as const;
  if (!kinds.includes(value as Options["kind"])) {
    throw new Error(`--kind must be one of: ${kinds.join(", ")}`);
  }
  return value as Options["kind"];
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 1000);
}

function tag(signal: Signal, key: string, scope: TagScope = "resource"): string {
  if (signal === "traces" && scope === "resource" && key === "service.name") {
    return TRACE_SERVICE_COLUMN;
  }

  const mapColumn = scope === "resource" ? "resources_string" : "attributes_string";
  return `${mapColumn}[${sqlString(key)}]`;
}

function tagEquals(signal: Signal, key: string, value: string, scope?: TagScope): string {
  return `${tag(signal, key, scope)} = ${sqlString(value)}`;
}

async function queryClickHouse(sql: string, options: Options): Promise<JsonRow[]> {
  const url = new URL(options.host);
  url.searchParams.set("default_format", "JSONEachRow");
  url.searchParams.set("enable_http_compression", "1");

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
  };

  if (options.user) {
    const token = Buffer.from(`${options.user}:${options.password ?? ""}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: `${sql.trim()}\nFORMAT JSONEachRow`,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ClickHouse query failed (${response.status}): ${text}`);
  }

  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRow);
}

function printRows(title: string, rows: JsonRow[]): void {
  console.log(`\n## ${title}`);
  if (rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  console.table(rows);
}

function servicePredicate(options: Options): string {
  return tagEquals("traces", "service.name", options.service);
}

function logServicePredicate(options: Options): string {
  return tagEquals("logs", "service.name", options.service);
}

async function listServices(options: Options): Promise<void> {
  const rows = await queryClickHouse(
    `
    SELECT
      ${tag("traces", "service.name")} AS service,
      count() AS spans,
      round(quantile(0.95)(duration_nano) / 1000000, 2) AS p95_ms,
      sum(if(has_error, 1, 0)) AS error_spans
    FROM signoz_traces.signoz_index_v3
    WHERE timestamp >= now64(9) - INTERVAL ${options.hours} HOUR
      AND ${tag("traces", "service.name")} != ''
    GROUP BY service
    ORDER BY spans DESC
    LIMIT ${clampLimit(options.limit)}
    `,
    options,
  );
  printRows(`services in last ${options.hours}h`, rows);
}

async function serviceSummary(options: Options): Promise<void> {
  const rows = await queryClickHouse(
    `
    SELECT
      ${tag("traces", "service.name")} AS service,
      count() AS spans,
      min(timestamp) AS first_seen,
      max(timestamp) AS last_seen,
      round(avg(duration_nano) / 1000000, 2) AS avg_ms,
      round(quantile(0.95)(duration_nano) / 1000000, 2) AS p95_ms,
      round(quantile(0.99)(duration_nano) / 1000000, 2) AS p99_ms,
      sum(if(has_error, 1, 0)) AS error_spans
    FROM signoz_traces.signoz_index_v3
    WHERE timestamp >= now64(9) - INTERVAL ${options.hours} HOUR
      AND ${servicePredicate(options)}
    GROUP BY service
    `,
    options,
  );
  printRows(`${options.service} summary`, rows);
}

async function recentErrors(options: Options): Promise<void> {
  const rows = await queryClickHouse(
    `
    SELECT
      timestamp AS ts,
      name,
      status_code_string AS status,
      status_message,
      round(duration_nano / 1000000, 2) AS duration_ms,
      trace_id,
      span_id
    FROM signoz_traces.signoz_index_v3
    WHERE timestamp >= now64(9) - INTERVAL ${options.hours} HOUR
      AND ${servicePredicate(options)}
      AND (has_error OR status_code_string = 'Error')
    ORDER BY timestamp DESC
    LIMIT ${clampLimit(options.limit)}
    `,
    options,
  );
  printRows(`${options.service} recent error spans`, rows);
}

async function slowTraces(options: Options): Promise<void> {
  const rows = await queryClickHouse(
    `
    SELECT
      timestamp AS ts,
      name,
      kind_string AS kind,
      http_method,
      http_url,
      response_status_code AS http_status,
      round(duration_nano / 1000000, 2) AS duration_ms,
      status_code_string AS status,
      trace_id,
      span_id
    FROM signoz_traces.signoz_index_v3
    WHERE timestamp >= now64(9) - INTERVAL ${options.hours} HOUR
      AND ${servicePredicate(options)}
    ORDER BY duration_nano DESC
    LIMIT ${clampLimit(options.limit)}
    `,
    options,
  );
  printRows(`${options.service} slowest spans`, rows);
}

async function recentLogs(options: Options): Promise<void> {
  const rows = await queryClickHouse(
    `
    SELECT
      fromUnixTimestamp64Nano(toInt64(timestamp)) AS ts,
      severity_text AS severity,
      left(body, 240) AS body,
      trace_id,
      span_id
    FROM signoz_logs.logs_v2
    WHERE timestamp >= toUnixTimestamp64Nano(now64(9) - INTERVAL ${options.hours} HOUR)
      AND ${logServicePredicate(options)}
    ORDER BY timestamp DESC
    LIMIT ${clampLimit(options.limit)}
    `,
    options,
  );
  printRows(`${options.service} recent logs`, rows);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  console.log(`ClickHouse: ${options.host}`);
  console.log(`Window: last ${options.hours}h`);

  if (options.kind === "services") {
    await listServices(options);
    return;
  }

  if (options.kind === "all" || options.kind === "summary") {
    await serviceSummary(options);
  }
  if (options.kind === "all" || options.kind === "errors") {
    await recentErrors(options);
  }
  if (options.kind === "all" || options.kind === "traces") {
    await slowTraces(options);
  }
  if (options.kind === "all" || options.kind === "logs") {
    await recentLogs(options);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
