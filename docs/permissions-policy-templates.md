# Permission Policy Templates

This document explains how policy templates work in the permissions system, how they integrate with the request queue, and what users should expect to see in the UI.

## What This Feature Is

Policy templates are reusable access patterns for common permission requests.

Each template defines:

- The request `scope`
- An optional `resource` constraint
- Which `team_ids` are allowed to use the template
- Which `privileges` are covered
- The `approval_mode`
- The expected `risk`
- The owning team via `owner_id`

Examples:

- "Analytics read sandbox"
- "Catalog bootstrap"
- "Operational writeback"

From a product perspective, policy templates are the rulebook behind the request queue.

- The request queue is the inbox of actual access requests.
- Policy templates determine whether a request is standard, reviewable, escalated, or exceptional.

## Why This Exists

Without templates, every request is treated as a manual decision.

With templates, the system can distinguish between:

- Standard requests that match a known safe pattern
- Requests that still need a reviewer, but should be routed in a predictable way
- Higher-risk requests that should be escalated
- One-off exceptions that do not match any policy

That gives the product three benefits:

- Faster handling for repeated request patterns
- More consistent queue behavior across teams
- Better visibility into why a request landed in a given state

## Template Fields

Each policy template includes the following behaviorally important fields:

- `scope`: `catalog`, `schema`, or `table`
- `resource`: optional specific resource such as `marketing` or `risk.gold_chargebacks`
- `team_ids`: allowed requester teams
- `privileges`: privileges the template covers
- `approval_mode`: `auto`, `review`, or `escalate`
- `risk`: `low`, `medium`, or `high`
- `owner_id`: the team responsible for that template

The `approval_mode` drives how the request queue behaves:

- `auto`: the request is approved immediately
- `review`: the request becomes grant-ready and is routed to a reviewer
- `escalate`: the request remains pending and is routed for stricter review

## How Matching Works

When a new permission request is created, the controlplane tries to match it to a policy template.

The current match rule is:

- `request.scope` must equal `template.scope`
- `template.resource` must be `NULL` or equal `request.resource`
- `request.team_id` must be listed in `template.team_ids`
- Every requested privilege must be contained in `template.privileges`

If multiple templates match, the system picks the most specific one:

- Resource-specific templates win before generic templates
- Fewer template teams wins next
- Fewer template privileges wins next
- More recently updated templates win next
- Template ID is the final tie-breaker

This behavior is implemented in `packages/controlplane/src/application/permission_service.rs`.

## How It Integrates With The Request Queue

The integration point is request creation.

Flow:

1. A user submits a permission request from the catalog UI.
2. The request is stored in `permission_requests`.
3. The controlplane loads policy templates and tries to find the best match.
4. If a match is found, the request is updated with:
   - `policy_template_id`
   - template name and owner metadata
   - template resource metadata
   - derived reviewer
   - derived risk
   - derived queue status
5. The queue then shows both the request and the policy decision that produced that state.

This means the queue is no longer just a list of raw requests. It becomes a view of policy execution.

## Queue Outcomes

### Auto

If a request matches a template with `approval_mode = auto`:

- The grant is executed immediately
- The request status becomes `approved`
- The queue decision is `auto-approved`

Product meaning:

- This was a standard request and no human queue action was needed

### Review

If a request matches a template with `approval_mode = review`:

- The request status becomes `ready`
- The queue decision is `reviewer-gate`
- The reviewer is derived from the template owner mapping

Product meaning:

- This request follows a known policy, but still needs a reviewer to finalize it

### Escalate

If a request matches a template with `approval_mode = escalate`:

- The request status remains `pending`
- The queue decision is `security-escalation`
- The reviewer is routed to the escalation owner

Product meaning:

- This is a recognized request type, but it is intentionally high-friction

### No Match

If no template matches:

- The request stays in its default queue path
- The queue decision is `manual-review`
- No template metadata is attached

Product meaning:

- This is an exception request
- The queue has to handle it as a one-off case

## Reviewer Routing

Template ownership also affects who receives the request.

Current behavior:

- `owner_id` directly identifies the reviewer team
- There is no string-based owner-name mapping anymore

## What The UI Shows

The integration is visible in two places.

### 1. Permission Request Queue

The queue now shows:

- The matched template name, if any
- The template approval mode
- The queue decision
- The template owner under reviewer context

Example queue labels:

- `Auto-approved by template`
- `Matched template, routed to reviewer`
- `Matched template, escalated`
- `No template match, manual triage`

This makes it clear whether a request is:

- a standard request
- a governed-but-manual request
- an escalated request
- an exception

### 2. Catalog Request Panel

When a user submits a request from the catalog page, the request history now also shows:

- Which template matched
- Whether it was auto-approved, routed, escalated, or left for manual review

This matters because users can see the policy effect immediately after submission instead of only discovering it in the queue later.

## Data Model Changes

To support this integration, the request model now stores policy-template metadata on each permission request.

Important fields added to request responses:

- `policy_template_id`
- `policy_template_name`
- `policy_template_resource`
- `policy_template_approval_mode`
- `policy_template_owner_id`
- `policy_template_owner`
- `queue_decision`

This is intentional. The queue should render the server's policy decision, not guess it in the client.

## Migration And Backfill

The fresh-start migration layout now bakes this directly into
`packages/controlplane/migrations/002_permission_requests.sql`.

That migration creates:

- `users`
- `teams`
- normalized `policy_templates`
- `permission_requests` with `policy_template_id`

It also seeds:

- team and user records
- resource-scoped and generic policy templates
- permission requests that already demonstrate matched-template behavior

That means old demo requests can immediately demonstrate the combined feature after migration.

## Worked Examples

### Example 1: Auto-approved analytics read

Template:

- `Analytics read sandbox`
- Scope: `schema`
- Resource: any resource
- Teams: `Growth Analytics`, `Finance BI`, `Executive Analytics`
- Privileges: `USE_SCHEMA`, `SELECT`
- Approval mode: `auto`

Request:

- Team: `Finance BI`
- Scope: `schema`
- Privileges: `USE_SCHEMA`, `SELECT`

Result:

- Template match: yes
- Status: `approved`
- Queue decision: `auto-approved`
- Reviewer: template owner route

What this means:

- This is a standard low-risk analytics read pattern
- The system should not make a reviewer re-approve it every time

### Example 2: Catalog bootstrap needs review

Template:

- `Catalog bootstrap`
- Scope: `catalog`
- Resource: `marketing`
- Teams: `Growth Analytics`, `ML Platform`
- Privileges: `USE_CATALOG`, `CREATE_SCHEMA`
- Approval mode: `review`

Request:

- Team: `Growth Analytics`
- Scope: `catalog`
- Privileges: `USE_CATALOG`, `CREATE_SCHEMA`

Result:

- Template match: yes
- Status: `ready`
- Queue decision: `reviewer-gate`

What this means:

- The request is known and valid as a pattern
- It still requires a reviewer to confirm the actual grant

### Example 3: Operational writeback is recognized but still controlled

Template:

- `Operational writeback`
- Scope: `table`
- Resource: `risk.gold_chargebacks`
- Teams: `Operations`, `Fraud Ops`
- Privileges: `SELECT`, `MODIFY`
- Approval mode: `review`

Request:

- Team: `Fraud Ops`
- Scope: `table`
- Privileges: `SELECT`, `MODIFY`

Result:

- Template match: yes
- Status: `ready`
- Queue decision: `reviewer-gate`
- Risk: `high`

What this means:

- The system knows this access pattern
- It is still sensitive enough that a reviewer should be in the loop

### Example 4: Sensitive feature access escalates

Template:

- `Sensitive feature access`
- Scope: `table`
- Resource: `feature_store.user_embeddings`
- Teams: `ML Platform`
- Privileges: `SELECT`
- Approval mode: `escalate`

Request:

- Team: `ML Platform`
- Scope: `table`
- Privileges: `SELECT`

Result:

- Template match: yes
- Status: `pending`
- Queue decision: `security-escalation`

What this means:

- This is a known request type
- The policy explicitly says it needs a stricter approval path

### Example 5: Manual exception

Request:

- Team: `Support Intelligence`
- Scope: `table`
- Privileges: `SELECT`, `MODIFY`

Assume no template covers that combination.

Result:

- Template match: no
- Status: default queue path
- Queue decision: `manual-review`

What this means:

- The system has no standard rule for this request
- A human must evaluate it as an exception

## Product Mental Model

The cleanest mental model is:

- Policy templates are the policy layer
- Request queue is the operations layer

Or more concretely:

- Templates answer: "What should happen for this kind of request?"
- Queue answers: "What happened for this specific request?"

## Current Limitations

Current behavior is intentionally simple:

- Matching uses team ID, scope, optional resource, and privilege set
- Templates are visible in the UI, but there is not yet a full authoring workflow

This is good enough to demonstrate how policy and queue behavior work together, but it is not yet a full policy engine.

## Future Extensions

Natural next steps:

- Add resource-level or catalog-level template constraints
- Add template authoring and editing in the UI
- Show the exact "matched because..." explanation on each request
- Add metrics such as template match rate and exception rate
- Let the queue filter by matched template or decision type

## Summary

Policy templates and request queue now work as one flow:

- Users submit requests
- The server evaluates them against standard templates
- The request is auto-approved, reviewer-routed, escalated, or left as an exception
- The queue shows that decision explicitly

That turns the queue from a passive list into a policy-aware workflow.
