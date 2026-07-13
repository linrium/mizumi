You are working on the Mizuumi lakehouse platform.

I want you to design and implement a first version of a Semantic Registry.

Before making changes, inspect the repository carefully and understand the current architecture, naming conventions, persistence patterns, API patterns, authentication/authorization flow, Unity Catalog integration, workflow/state model, and existing frontend structure.

Do not immediately start coding.

First:
1. inspect the repository;
2. identify the relevant existing modules and boundaries;
3. summarize how the feature should fit the existing architecture;
4. propose an implementation plan;
5. identify any assumptions or architectural conflicts;
6. then implement the feature incrementally.

# Architectural context

Mizuumi has the following core architecture.

The Control Plane is the workflow and policy authority. It governs, coordinates, records intent, manages lifecycle state, and mediates access to underlying engines.

The Data Plane performs workloads. Spark, DuckDB, Daft, Dagster, RustFS, and other engines execute work but should not become the authority for governance state.

Unity Catalog remains the governed catalog and securable object model for physical data resources such as catalogs, schemas, tables, models, and volumes.

Dagster is responsible for dataflow orchestration, dependencies, checks, schedules, and materialization.

Spark, DuckDB, and Daft are execution engines.

RustFS is physical object storage.

The Semantic Registry must follow the same philosophy:

    centralize shared business meaning,
    not centralized ownership of every computation.

The registry must not become a central pipeline team or a service through which every data query must flow.

The main principle is:

    Definition is shared.
    Version is immutable.
    Execution is distributed.
    Access is governed.
    Failures are isolated.
    Migration is explicit.

# Problem being solved

Today, a common data-sharing pattern is:

    consumer team requests a metric or transformation
        ->
    source team interprets the requirement
        ->
    source team implements a pipeline
        ->
    multiple consumers depend on the same result
        ->
    source team becomes a delivery bottleneck
        ->
    a bug in the shared pipeline affects many consumers

We want to separate ownership into four concepts.

## 1. Canonical Data Product

A source domain publishes stable and governed reusable data products.

Example:

    hdbank.shared.settled_transaction

with fields such as:

    customer_token
    transaction_id
    settled_at
    merchant_category
    settled_amount
    reversal_amount
    cashback_amount
    currency

The source team owns:
- correctness of the product;
- source-system interpretation;
- schema contract;
- quality expectations;
- freshness/SLA;
- versioning of the data contract.

The source team should not have to implement every consumer-specific use case.

## 2. Source Semantics

Source semantics explain what source-domain concepts mean.

Examples:

    What exactly is a SETTLED transaction?
    How is REVERSAL different from REFUND?
    Is settled_amount authorization amount or final settlement amount?
    Which timestamp represents settlement completion?

These semantics are owned by the source domain.

## 3. Shared Semantic Definitions

Shared semantic definitions represent reusable business meaning.

Example:

    finance.net_spend@v3

defined conceptually as:

    settled_amount
    - reversal_amount
    - cashback_amount

The semantic definition is:
- reusable;
- governed;
- versioned;
- owned by an appropriate business or metric steward;
- independent from one specific materialized table;
- independent from one specific consumer pipeline.

A shared semantic definition may be:
- computed on demand;
- compiled into a consumer pipeline;
- used in a DuckDB query;
- used in a Spark job;
- materialized by Dagster into a physical table.

The registry does NOT replace tables.

A table is a physical result or materialization.

A semantic definition is the source of truth for business meaning.

For example:

    finance.net_spend@v3
        |
        +--> DuckDB ad hoc query
        |
        +--> VietJet Spark pipeline
        |
        +--> Risk Spark pipeline
        |
        +--> Dagster materialization
                  |
                  v
        finance.customer_daily_net_spend

The same semantic definition can support multiple materializations with different grains.

## 4. Derived Domain

A derived domain is an ownership, execution, governance, and failure boundary for logic derived from one or more source domains.

Example:

    HDBank Source Domain
        spending_activity
              \
               \
                Customer Intelligence Derived Domain
               /
              /
    VietJet Source Domain
        flight_activity

The derived domain may own:
- customer intelligence;
- cross-company analytics;
- campaign audiences;
- feature generation;
- cross-domain models;
- consumer-specific transformation logic.

Consumer teams or cross-domain teams should be able to own their implementation while access remains governed.

# Semantic Registry design goals

Implement the Semantic Registry as a first-class Control Plane capability.

It should logically own:
- semantic definitions;
- version lifecycle;
- ownership metadata;
- dependency relationships;
- validation state;
- compatibility metadata;
- consumer references;
- deprecation state.

It should not:
- execute large data queries itself;
- proxy result sets;
- become a physical data storage system;
- replace Unity Catalog;
- replace Dagster;
- replace Spark, DuckDB, or Daft;
- contain all consumer-specific SQL.

# Important conceptual model

At minimum, support the following semantic object types.

## Semantic Model

Connects a governed physical data product to semantic concepts.

Example:

    name: hdbank.transaction_activity
    version: 3

    source:
      table: hdbank.shared.settled_transaction

    entity:
      name: transaction
      primary_key: transaction_id

    dimensions:
      - merchant_category
      - settlement_date

    measures:
      - settled_amount
      - reversal_amount
      - cashback_amount

## Entity

Represents a business entity such as:

    Customer
    Account
    Transaction
    Booking
    Passenger
    Flight

Entities may have keys and relationships.

The registry should eventually be able to model:
- entity keys;
- relationship direction;
- join cardinality;
- valid join paths.

This matters because naive joins can create fan-out errors.

Example:

    Customer
       1
       |
       N
    Transaction

and:

    Customer
       1
       |
       N
    Flight

A naive Transaction x Flight join can multiply rows and overcount metrics.

The first implementation may be simpler, but design the model so cardinality and join validation can be extended later.

## Dimension

Examples:

    merchant_category
    customer_segment
    city
    booking_channel
    flight_route

A dimension may reference:
- a source field;
- a derived expression.

## Measure

Examples:

    settled_amount
    booking_count
    passenger_count
    flight_distance

A measure should include aggregation semantics where appropriate.

## Metric

Example:

    finance.net_spend@v3

with:
- expression;
- aggregation;
- time semantics;
- owner;
- dependencies;
- valid dimensions;
- lifecycle status.

## Semantic Package

Optionally group multiple related semantic definitions into one versioned package.

Example:

    finance/customer-value@v4

containing:
- net_spend;
- gross_spend;
- refund_rate;
- transaction_frequency;
- customer_value_band.

The first implementation can defer full package behavior if it adds too much scope, but the domain model should not block it.

# Versioning model

Versions must be immutable.

Do not mutate an active semantic definition in place.

Example:

    finance.net_spend@v3
    finance.net_spend@v4

Consumers should explicitly reference a version.

Suggested lifecycle:

    draft
        ->
    validated
        ->
    candidate
        ->
    certified
        ->
    active
        ->
    deprecated
        ->
    retired

For the MVP, simplify this if necessary, but preserve the principle that active versions are immutable and migration is explicit.

A consumer should be able to stay pinned to v3 while another consumer migrates to v4.

# Semantic dependency graph

The registry must model semantic dependencies.

Example:

    settled_amount
         |
         v
    net_spend@v3
         |
         v
    travel_spend_12m@v4
         |
         v
    high_value_traveler@v2

This is different from physical runtime lineage.

Semantic dependency graph:

    what business definition depends on what definition

Runtime lineage:

    what job actually read or wrote what physical artifact

The long-term goal is to combine:

    semantic dependency
        +
    runtime lineage
        +
    usage evidence
        =
    impact graph

The MVP should at least expose the semantic dependency graph and make it possible to query direct and transitive dependents.

# Unity Catalog integration

Unity Catalog remains the catalog of governed physical data objects.

The Semantic Registry should reference Unity Catalog securables by stable identity.

Example:

    semantic definition:
      finance.net_spend@v3

    physical dependency:
      hdbank.shared.settled_transaction

Do not duplicate the entire Unity Catalog object model in the registry.

The registry should store semantic metadata and references to governed objects.

Conceptually:

    Unity Catalog:
        Where is the governed data object?
        What securable is it?
        Who may access it?

    Semantic Registry:
        What does this business concept mean?
        How is it calculated?
        What version is active?
        Who owns it?
        What depends on it?

# Data Contract relationship

A Data Contract and a Semantic Definition are different.

Data Contract:

    contract of supplied data

It covers:
- schema;
- field meanings;
- quality;
- freshness;
- SLA.

Semantic Definition:

    contract of shared business meaning

It covers:
- business formula;
- aggregation behavior;
- time semantics;
- valid dimensions;
- semantic dependencies;
- business owner;
- semantic version.

Example:

    finance.net_spend@v4
        depends on
    hdbank.settled_transaction contract@v3

If the input contract changes incompatibly, the Semantic Registry should be able to identify affected definitions.

For the MVP, model the dependency and expose validation hooks even if full automated contract compatibility checking is deferred.

# Execution model

The registry should not execute queries itself.

The design should support a path like:

    consumer workload
        ->
    Control Plane
        ->
    Semantic Registry resolves definition
        ->
    semantic plan or normalized definition
        ->
    authorization
        ->
    temporary scoped credential
        ->
    execution engine
        ->
    physical data

Potential consumers include:
- Spark pipelines;
- DuckDB interactive sessions;
- Daft workloads;
- Dagster materializations;
- dashboards;
- agents.

Do not require every query to pass through the registry service at runtime if definitions can be resolved ahead of time.

# Definition representation

Do not make raw SQL the only canonical format.

Raw SQL creates engine-specific problems:
- Spark dialect differences;
- DuckDB dialect differences;
- function differences;
- timezone semantics;
- null semantics;
- window behavior.

Prefer a structured domain model or semantic DSL that can be normalized.

Conceptual flow:

    Semantic DSL / API representation
        ->
    Normalized Semantic IR
        ->
    Engine adapter
        +--> DuckDB SQL
        +--> Spark SQL
        +--> future Daft expressions

For the MVP, implement only the amount of compiler functionality that fits the current repository.

A reasonable first step could be:
- structured expression AST;
- validation;
- dependency resolution;
- one compiler target, likely DuckDB or Spark depending on current codebase maturity.

Do not over-engineer a generic query compiler in the first iteration.

# Suggested API capabilities

Inspect the existing API conventions before deciding exact routes.

The Semantic Registry should eventually support operations conceptually equivalent to:

Create a semantic definition:

    POST semantic definitions

Get a definition:

    GET semantic definition by namespace, name, and version

List versions:

    GET versions of finance.net_spend

Resolve dependencies:

    GET dependency graph for finance.net_spend@v3

Get downstream dependents:

    GET impact or dependents for finance.net_spend@v3

Create a new version:

    POST new immutable version

Transition lifecycle:

    draft -> candidate
    candidate -> certified
    certified -> active
    active -> deprecated
    deprecated -> retired

List consumers pinned to a version.

Validate a definition.

Compile or resolve a semantic definition to an execution representation.

Follow current repository conventions rather than blindly implementing these exact REST paths.

# Suggested persistence model

Inspect the current Control Plane database and ORM/data-access style first.

The logical model may need entities similar to:

SemanticDefinition
- id
- namespace
- name
- object_type
- version
- status
- owner_principal
- description
- expression or structured specification
- time semantics
- created_at
- created_by
- supersedes_version
- deprecation_deadline

SemanticDependency
- source_definition_id
- target_definition_id
- dependency_type

PhysicalDependency
- semantic_definition_id
- Unity Catalog securable reference
- optional contract version

ConsumerBinding
- consumer artifact or workload identity
- semantic definition version
- binding status

LifecycleTransition
- definition version
- previous status
- new status
- principal
- timestamp
- reason

Do not use this schema blindly. Adapt it to the repository's current domain and persistence architecture.

# Example end-to-end use case

Use this as the reference behavior.

HDBank publishes:

    hdbank.shared.settled_transaction

Finance defines:

    finance.net_spend@v3

conceptually:

    settled_amount
    - reversal_amount
    - cashback_amount

Customer Strategy defines:

    customer.travel_spend_12m@v4

which depends on:

    finance.net_spend@v3

and adds:
- merchant category filtering;
- trailing 12 month time window.

VietJet owns a consumer-specific definition:

    business_class_prospect

conceptually:

    travel_spend_12m@v4 > 100M
    AND completed_flights_12m >= 4
    AND business_class_flights = 0

The first two shared definitions may live in the Semantic Registry.

The last rule may remain local to the VietJet derived domain because it is consumer-specific.

The registry should avoid becoming a dumping ground for every CASE WHEN expression.

Use the principle:

    local logic stays local;
    reusable stable business meaning may be promoted to the registry.

# Materialization model

Semantic Registry does not replace physical tables.

Support this mental model:

    Semantic Definition
            |
            +--> compute on demand
            |
            +--> compile into a consumer pipeline
            |
            +--> Dagster materialization
                        |
                        v
                     Table

Example:

    finance.net_spend@v3

can be used by:
- an interactive DuckDB query;
- a VietJet Spark pipeline;
- a Risk pipeline;
- a Dagster job materializing
  finance.customer_daily_net_spend.

A physical materialization should be able to reference:
- semantic definition;
- semantic version;
- grain;
- input versions;
- materialization artifact identity.

If existing repository abstractions already model artifacts or materializations, reuse them.

# Validation requirements

At minimum, the registry should validate:

1. namespace/name/version uniqueness;
2. immutable published versions;
3. referenced semantic dependencies exist;
4. referenced physical objects are structurally valid references;
5. no direct or transitive dependency cycles;
6. lifecycle transitions are valid;
7. owner is present;
8. definitions are structurally valid for their semantic object type.

Later validation may include:
- type checking;
- grain compatibility;
- join cardinality safety;
- engine compilation compatibility;
- dimension compatibility;
- data contract compatibility.

Design extension points for these but do not implement everything at once.

# Authorization and governance

Follow the current Control Plane authorization model.

Expected policy direction:

- reading an active semantic definition may be broadly permitted within policy;
- creating a definition requires appropriate author privileges;
- certifying or activating a definition requires semantic owner/steward authority;
- deprecating and retiring require owner or governance authority;
- using a semantic definition does not automatically grant access to underlying physical data.

This is critical:

    semantic permission != physical data permission

For example, a user may understand that finance.net_spend@v3 exists without being allowed to read transaction-level data.

Do not implement any authorization bypass through semantic resolution.

# Credential vending integration

The existing architectural principle is that workloads should not hold broad standing storage credentials.

Eventually the flow should be:

    semantic dependency graph
        ->
    required physical inputs
        ->
    minimum required data scope
        ->
    policy evaluation
        ->
    temporary scoped credential
        ->
    execution workload

For the MVP:
- expose enough dependency metadata for this integration;
- do not introduce permanent credentials;
- do not embed storage credentials in definitions;
- do not allow the registry to become a credential store.

If the existing codebase already has credential vending support, integrate with its abstractions rather than creating a parallel path.

# Evidence and audit

Semantic Registry state changes should be auditable.

Record important events such as:
- definition created;
- version created;
- validation performed;
- status transitioned;
- definition certified;
- definition activated;
- definition deprecated;
- consumer binding added;
- consumer binding migrated.

Use the current evidence/audit mechanism if one exists.

Do not create a separate disconnected audit framework.

# UI requirements

Inspect the existing Web UI.

For an MVP, implement a simple Semantic Registry UI consistent with the current application.

At minimum, consider:

Semantic Registry list page:
- namespace;
- name;
- object type;
- current active version;
- owner;
- status.

Definition details page:
- description;
- version;
- owner;
- status;
- definition;
- physical dependencies;
- semantic dependencies;
- direct dependents;
- lifecycle history.

Version comparison:
- v3 vs v4;
- specification differences;
- dependency changes;
- status difference.

Dependency graph visualization is useful but should not block the MVP if the current UI does not have a graph library.

A structured dependency list is acceptable first.

# MVP implementation preference

Prefer a vertical slice over a large incomplete framework.

A good MVP could be:

1. persistence model for Metric definitions;
2. immutable versioning;
3. lifecycle states;
4. semantic-to-semantic dependencies;
5. physical Unity Catalog references;
6. DAG cycle validation;
7. CRUD/read API;
8. dependency and dependent traversal API;
9. simple UI list/detail pages;
10. tests.

Then optionally add:
11. structured expression AST;
12. compiler adapter for one engine;
13. materialization binding;
14. consumer bindings;
15. lifecycle approval workflow integration.

Do not attempt to build every future semantic-layer capability in one change.

# Testing expectations

Add meaningful tests.

At minimum test:

- creating a semantic metric;
- creating multiple immutable versions;
- rejecting duplicate version;
- rejecting mutation of immutable active version;
- valid lifecycle transition;
- invalid lifecycle transition;
- direct dependency;
- transitive dependency traversal;
- cycle rejection;
- physical dependency references;
- owner requirement;
- retrieving active version;
- deprecated version still readable;
- consumer binding pinned to exact version if implemented.

Where appropriate, add integration tests through the existing API layer.

# Important architectural boundaries

Keep these boundaries explicit:

    Unity Catalog
        governs physical securables

    Semantic Registry
        governs reusable business meaning

    Data Contract
        describes producer guarantees

    Dagster
        orchestrates materialization/dataflow

    Spark/DuckDB/Daft
        execute computation

    RustFS
        stores physical data

    Control Plane
        owns policy, lifecycle, workflow, coordination, and evidence

Do not collapse these responsibilities into one service.

# What I expect from you now

Start by exploring the repository.

Then respond with:

1. Current architecture findings
2. Relevant modules and files
3. Proposed Semantic Registry placement
4. Proposed domain model
5. Proposed persistence model
6. Proposed API changes
7. Proposed UI changes
8. Implementation phases
9. Risks and unresolved questions

After that, implement Phase 1 as a coherent vertical slice.

Prefer adapting the design to the existing repository over introducing unnecessary abstractions.

When implementation decisions are ambiguous, preserve the following principles:

    shared meaning is centralized;
    execution ownership is distributed;
    versions are immutable;
    consumers pin versions explicitly;
    physical access remains separately governed;
    the registry never becomes the data path;
    the registry never becomes the owner of every consumer pipeline.
