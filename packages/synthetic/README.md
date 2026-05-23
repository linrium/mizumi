# synthetic

Synthetic data generators for local demos and fixtures.

## Install

```bash
bun install
```

## Generate Vietnamese residents to CSV

```bash
bun run generate:vietnamese-residents --count 5000 --output output/vietnamese_residents.csv
```

The generator now sources Vietnamese administrative data from
`vietnam-address-database` and limits location generation to the `city` field for
these datasets:

- Ho Chi Minh
- Ha Noi
- Hai Phong
- Da Nang

Optional deterministic seed:

```bash
bun run generate:vietnamese-residents --count 100 --seed 42
```

The generator writes rows incrementally to disk, so it can handle large files without building the whole CSV in memory first.

## Generate Banking Transactions to CSV

```bash
bun run generate:banking-transactions --count 20000 --residents output/vietnamese_residents.csv --output output/banking_transactions.csv
```

This dataset uses the resident `id` column as `userId`. Transaction behavior is
generated with mathematical patterns rather than flat random sampling:

- per-user activity allocation from weighted score normalization
- income and spend curves using sine-wave monthly and quarterly seasonality
- Gaussian noise for amount variation
- balance continuity so each row has coherent `balanceBefore` and `balanceAfter`
- source/destination bank routing across `hdbank`, `techcombank`, `vietcombank`, `bidv`, `agribank`, `vietinbank`, `smbc`, `mufg`, `oub`, `citibank`, and `shinhan`
- merchant names aligned to the transaction category, with travel-oriented dining, groceries, and shopping spend
- elevated travel frequency split across `ota_travel`, `airline_ticket`, and destination-style `travel` merchants for famous places, resorts, and attractions

Optional deterministic seed:

```bash
bun run generate:banking-transactions --count 500 --seed 42
```

## Generate Flight Tickets to CSV

```bash
bun run generate:flight-tickets --count 5000 --residents output/vietnamese_residents.csv --output output/flight_tickets.csv
```

This dataset uses the resident `id` column as `userId` and generates synthetic
flight-ticket records with route, schedule, airline, cabin class, and pricing.
The airline list reuses the same airline source as travel merchants.

Pricing is generated mathematically from:

- route distance and duration
- airline-specific price multipliers
- cabin-class multipliers
- booking lead time
- departure seasonality
- bounded Gaussian price noise

The output is biased toward `Vietjet Air`, while still allowing more expensive
carriers like `All Nippon Airways`, `Japan Airlines`, and `Singapore Airlines`
to produce higher fare distributions.

Optional deterministic seed:

```bash
bun run generate:flight-tickets --count 500 --seed 42
```

## Generate Flight Incident Reports to CSV

```bash
bun run generate:flight-incidents --count 1000 --tickets output/flight_tickets.csv --output output/flight_incidents.csv
```

This dataset uses `flight_tickets.csv` as the source and only counts
`Vietjet Air` tickets. Incidents are treated as fresh app reports, so the file
captures report-time operational details only, with no `compensationAmount`.
The `vietjetCustomerId` field is sourced directly from the ticket `userId`.

The incident pattern is generated mathematically from:

- actual Vietjet ticket activity
- airport-specific incident weighting
- route, fare, cabin-class, baggage, and passenger-count incident weighting
- severity-specific delay curves
- bounded Gaussian variation

`baggage_damaged` is intentionally biased to appear more often at `HAN` and
`SGN`.

Optional deterministic seed:

```bash
bun run generate:flight-incidents --count 200 --seed 42
```

## Generate HDBank and VietjetAir Customer Profiles to CSV

```bash
bun run generate:brand-customers --count 5000 --residents output/vietnamese_residents.csv --output output
```

This generator uses the Vietnamese residents CSV as the source and assigns each
resident to exactly one of these three cases:

- `both_hdbank_and_vietjetair`
- `only_hdbank`
- `only_vietjetair`

The assignment is generated mathematically rather than by flat random labels:

- age-based affinity curves
- city-specific bank and airline bias terms
- deterministic hash-driven sine and cosine variation
- thresholding that guarantees one of the three requested outcomes

It writes two separate company-specific files:

- `output/hdbank_customers.csv`
- `output/vietjetair_customers.csv`

Each file has its own schema. For example:

- HDBank customers include `customerTier`, `averageMonthlyBalance`, and `creditScoreBand`
- VietjetAir customers include `skybossTier`, `annualFlights`, and `ancillarySpendScore`

Optional deterministic seed:

```bash
bun run generate:brand-customers --count 500 --seed 42
```
