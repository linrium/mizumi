# Chronicle Witnesses and Checkpoints

This document explains how Chronicle uses Tessera witnesses and how a
checkpoint is created when witnesses are enabled.

## Short Version

Chronicle appends entries to Tessera. Tessera integrates those entries into the
Merkle tree, then a background publisher periodically creates a candidate
checkpoint for the latest integrated tree state.

Witnesses do not create checkpoints. They verify and cosign candidate
checkpoints before Tessera makes those checkpoints public.

In this repository:

- Chronicle exposes `POST /entries` to append log entries.
- Chronicle exposes `GET /checkpoint` to read the latest published checkpoint.
- Chronicle can be configured with a witness policy.
- Each witness runs `cmd/witness` and exposes `/add-checkpoint`.
- Tessera calls each witness from its checkpoint publisher.

There is no separate Chronicle API like `POST /checkpoint`. To make new log
state available to readers, append entries and wait for Tessera's checkpoint
publisher to publish a checkpoint that covers those entries.

Chronicle currently configures Tessera with:

```go
WithCheckpointInterval(time.Second)
WithCheckpointRepublishInterval(time.Minute)
WithBatching(256, time.Second)
```

That means:

- entry sequencing is batched up to 256 entries or 1 second
- checkpoint publication is attempted about every 1 second
- unchanged checkpoints can be republished about every 1 minute

These values are currently hard-coded in `main.go`.

## Components

```text
              append bytes
Client  ---------------------->  Chronicle
                                  |
                                  | Tessera Add(entry)
                                  v
                            Tessera Appender
                                  |
                                  | batch + sequence entries
                                  | integrate entries into tree
                                  v
                          Integrated tree state
                                  |
                                  | every WithCheckpointInterval
                                  v
                         Checkpoint Publisher
                                  |
                                  | signs candidate checkpoint
                                  | with Chronicle log key
                                  v
                      Candidate checkpoint
                                  |
                                  | if witness policy is configured:
                                  | POST /add-checkpoint
                                  v
              +-------------------+-------------------+
              |                                       |
              v                                       v
       Witness A                                Witness B
       verifies Chronicle                       verifies Chronicle
       checkpoint signature                     checkpoint signature
       and consistency                          and consistency
              |                                       |
              +-------------------+-------------------+
                                  |
                                  | required cosignatures collected
                                  v
                         Published checkpoint
                                  |
                                  v
                         GET /checkpoint
```

The important distinction is:

```text
integrated entry:
  the entry is in Tessera's Merkle tree

published entry:
  a public checkpoint has a size greater than the entry index
```

Clients should treat an entry as visible only after a published checkpoint
covers that entry.

## What a Checkpoint Is

A checkpoint is a signed statement of the current transparency log tree. It
contains the log origin, the tree size, the Merkle root hash, and signatures.

Conceptually:

```text
chronicle
42
<merkle-root-hash>

-- chronicle <signature>
-- chronicle-witness-a <cosignature>
-- chronicle-witness-b <cosignature>
```

The exact note format is produced by Tessera and the transparency libraries.
Clients should treat the checkpoint as a signed note, not as application JSON.

## What a Witness Does

A witness is an independent signer that protects clients from split-view log
attacks.

When a witness receives a candidate checkpoint, it:

1. Verifies the checkpoint was signed by Chronicle's trusted log key.
2. Checks that the checkpoint origin matches the configured log origin.
3. Checks that the new checkpoint is consistent with the latest checkpoint the
   witness has already accepted for that origin.
4. Stores the latest accepted checkpoint in its witness state directory.
5. Adds its own cosignature.
6. Returns the witness signature line to Tessera.

A witness should be operated in a different trust domain from Chronicle in a
real deployment. The demo witnesses in this repository are for local and
Kubernetes simulation only.

## What Tessera Sends to Witnesses

Tessera sends each witness an HTTP request:

```text
POST <witness-url>/add-checkpoint
```

The request body follows the tlog-witness protocol:

```text
old <witness-last-known-tree-size>
<base64 consistency proof node>
<base64 consistency proof node>
...

<Chronicle-signed checkpoint note>
```

For a first update, the old size is usually zero and the consistency proof is
empty:

```text
old 0

chronicle
42
<merkle-root-hash>

-- chronicle <signature>
```

For a later update, Tessera includes a consistency proof from the witness's
previously accepted size to the new checkpoint size:

```text
old 42
<proof-node-1>
<proof-node-2>

chronicle
57
<new-merkle-root-hash>

-- chronicle <signature>
```

The witness response on success is not the whole checkpoint. It returns just
its signature line:

```text
-- chronicle-witness-a <cosignature>
```

Tessera appends successful witness signature lines to the Chronicle-signed
checkpoint. The resulting note is the witnessed checkpoint that can be
published.

## Does Tessera Wait for Every Witness?

Tessera sends witness requests in parallel. It returns as soon as the witness
policy is satisfied.

With the current demo policy:

```text
group simulated-external-witnesses all witness-a witness-b
quorum simulated-external-witnesses
```

both `witness-a` and `witness-b` are required, so Tessera effectively waits for
both valid cosignatures.

With a different policy, Tessera might need only a subset of witnesses. For
example, a threshold policy could allow publication after enough witnesses
respond successfully, even if some witnesses are slow or unavailable.

Chronicle currently passes these witness options to Tessera:

```go
FailOpen: cfg.witnessFailOpen
Timeout:  cfg.witnessTimeout
```

The defaults in Chronicle are:

```text
CHRONICLE_WITNESS_FAIL_OPEN=false
CHRONICLE_WITNESS_TIMEOUT=5s
```

So, by default, if the configured witness policy is not satisfied within 5
seconds, the candidate checkpoint is not published.

## Witness Policy

Chronicle reads a Sigsum-style witness policy from either:

```text
CHRONICLE_WITNESS_POLICY
CHRONICLE_WITNESS_POLICY_FILE
```

The demo policy is generated by the Makefile and also exists in
`manifests/witness-policy.yaml`:

```text
log chronicle+b59447d9+AQrolSg0fHgLthI/SMPGLWKSxjh68AD1nFC1lfuFRJci
witness witness-a chronicle-witness-a+d20bc03f+BEq/8C02KWBHKydd2B/VxZngcySa7tf2iMvnFAZBZYM1 http://127.0.0.1:3011
witness witness-b chronicle-witness-b+c43965fa+BDo+DdwgdqA72U9FKS6M1zXceB7WWQgd4T4EiwNayB8N http://127.0.0.1:3012
group simulated-external-witnesses all witness-a witness-b
quorum simulated-external-witnesses
```

Meaning:

- `log` declares Chronicle's checkpoint verifier key.
- `witness` declares each witness name, public key, and URL.
- `group ... all witness-a witness-b` says both witnesses are part of the group.
- `quorum simulated-external-witnesses` says the group must satisfy the policy.

With this demo policy, Tessera needs both witness cosignatures before a
checkpoint can be published.

## Local Demo Flow

From `packages/chronicle`:

```sh
make run
```

The Makefile starts:

- Chronicle on `:3008`
- witness A on `:3011`
- witness B on `:3012`

It also writes demo keys and the witness policy under `.data/demo`.

Append an entry:

```sh
curl -X POST http://localhost:3008/entries \
  --data-binary 'hello witnessed checkpoint'
```

Read Chronicle status:

```sh
curl http://localhost:3008/tessera
```

The response should include:

```json
{
  "witness_enabled": true,
  "witness_policy": ".data/demo/witness-policy",
  "witness_fail_open": false,
  "witness_timeout": "5s"
}
```

Read the published checkpoint:

```sh
curl http://localhost:3008/checkpoint
```

Read what each witness remembers:

```sh
curl 'http://localhost:3011/checkpoint?origin=chronicle'
curl 'http://localhost:3012/checkpoint?origin=chronicle'
```

The Chronicle checkpoint should include Chronicle's own signature plus the
required witness cosignatures.

## Manual Process

If you do not use `make run`, start the pieces separately.

Create demo files:

```sh
make witness-demo-files
```

Start witness A:

```sh
make run-witness-a
```

Start witness B in another terminal:

```sh
make run-witness-b
```

Start Chronicle in another terminal:

```sh
make run-server
```

Then append an entry:

```sh
curl -X POST http://localhost:3008/entries \
  --data-binary 'create a checkpoint'
```

Finally, read the checkpoint:

```sh
curl http://localhost:3008/checkpoint
```

## Kubernetes Flow

The Kubernetes manifests include:

- `manifests/witnesses.yaml` for `chronicle-witness-a` and
  `chronicle-witness-b`
- `manifests/witness-demo-keys.yaml` for demo keys
- `manifests/witness-policy.yaml` for the policy
- `manifests/deployment.yaml` for Chronicle's witness configuration

The Chronicle deployment mounts the witness policy at:

```text
/etc/chronicle/witness/policy
```

and sets:

```text
CHRONICLE_WITNESS_POLICY_FILE=/etc/chronicle/witness/policy
CHRONICLE_WITNESS_FAIL_OPEN=false
CHRONICLE_WITNESS_TIMEOUT=5s
```

After deployment, append an entry to Chronicle. Tessera sequences and integrates
the entry, then the checkpoint publisher attempts to publish a checkpoint on
its interval. That checkpoint is made public only after the witness policy is
satisfied.

## Failure Modes

`CHRONICLE_WITNESS_FAIL_OPEN=false` is the strict mode.

```text
Append entry
    |
    v
Batch + sequence entry
    |
    v
Integrate into tree
    |
    v
Checkpoint interval tick
    |
    v
Build candidate checkpoint
    |
    v
Ask witnesses
    |
    +-- witness quorum succeeds ---> publish checkpoint
    |
    +-- witness quorum fails ------> append/checkpoint publication fails
```

`CHRONICLE_WITNESS_FAIL_OPEN=true` allows Chronicle to continue publishing if
witnesses time out or fail. This is useful for development, but it weakens the
protection witnesses provide.

## Important Operational Notes

Keep Chronicle's log signer key stable. It is configured with
`CHRONICLE_SIGNER_KEY_FILE`. If the key changes while old log data remains,
clients and witnesses that trust the previous verifier key will reject future
checkpoints.

Keep witness state stable in real deployments. The demo Kubernetes manifests
use `emptyDir` for witness state, which is acceptable for a simulation but not
for production. A real witness should retain its accepted checkpoint history so
it can reject inconsistent future checkpoints.

Do not call a witness directly to create Chronicle checkpoints. Witness
`/add-checkpoint` is the internal endpoint Tessera uses to request
cosignatures. The normal Chronicle workflow is:

```text
POST /entries  ->  Tessera integrates entry  ->  checkpoint interval tick
                ->  Tessera asks witnesses   ->  Tessera publishes checkpoint
GET  /checkpoint
```
