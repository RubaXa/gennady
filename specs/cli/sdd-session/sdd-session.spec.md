# Module: `sdd-session`

**Module:** sdd-session · **Parent scope:** [cli](../cli.spec.md) · **Task:** bootstrap — SDD v2 tooling

<!--SECTION:MODULE_VISION-->

## 1. Module Vision

CLI-owned scratch session for SDD flows. Generic `set`/`log`/`workset`/`term` operations preserve
human-readable context; typed modes own scaffold-critic and execute-worker transitions so an agent
cannot skip evidence, lose its worker, bypass a budget, or infer a transition from chat memory.

**Key properties:**

- `feasibility` accepts only a one-shot file under `.claude/tmp/`
- Existing `sdd-scaffold-feasibility/v1` journal events are parsed and folded before append
- Invalid JSON, schema, cycle, sequence, result count, target hashes, worker, cap, Gate 2, or restart
  transition fails without changing the session or consuming the payload
- Success appends exactly one event and emits one deterministic `NEXT=` instruction
- JSON key order and target-map insertion order are not semantic
- `checkpoint` retains execute task/phase/evidence/attempt/deviation refs and owns the only legal
  autonomous replan or operator-escalation `NEXT=`

<!--/SECTION:MODULE_VISION-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->

## 2. Module Usage Example

```bash
$ npx gennady sdd-session feasibility --content-file .claude/tmp/sdd-scaffold-feasibility-event.json
[sdd-session] feasibility event accepted
NEXT=DISPATCH_CRITIC cycle=scaffold-1 resultCount=0 activeCap=5 workerSession=critic-42
```

The payload is one JSON line with schema `sdd-scaffold-feasibility/v1`. The event sequence is
`opened` → `worker-state` → one `sensor-result` per critic response, with `target-refreshed`,
`operator-disposition`, and `gate2-choice` inserted only when the returned `NEXT=` requests them;
the terminal event is `closed`.

```bash
$ npx gennady sdd-session checkpoint --content-file .claude/tmp/sdd-worker-checkpoint-event.json
[sdd-session] checkpoint accepted: sdd-worker-checkpoint/v1
NEXT=AUTO_REPLAN_AND_CONTINUE task=IB-boot phase=P1 attempt=1/2 refs=...
```

<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:ENTITY_INVENTORY-->

## 3. Entity Inventory (Closed-World)

| Name                                                                                                                           | Type         | Purpose                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------- |
| `run`                                                                                                                          | Command      | Parse and execute one session operation                  |
| `applyFeasibilityEvent`                                                                                                        | Utility      | Validate, fold, and append one typed feasibility event   |
| `applyWorkerCheckpoint`                                                                                                        | Utility      | Validate, fold, and append one execute-worker checkpoint |
| `buildSkeleton` · `setField` · `appendToSection` · `setGlossaryTerm`                                                           | Utility      | Pure session-file builders                               |
| `hasPlaceholder` · `isValidTermEntry`                                                                                          | Utility      | Generic session payload validation                       |
| `badInvocation` · `feasibilityError` · `checkpointError` · `placeholderError` · `noSession` · `payloadFileError` · `fileError` | Utility      | Stable diagnostic builders                               |
| `ERR_CLI_SDD_SESSION_BAD_INVOCATION` · `ERR_CLI_SDD_SESSION_FILE` · `ERR_CLI_SDD_SESSION_NO_SESSION`                           | Value Object | Generic session error identifiers                        |
| `ERR_CLI_SDD_SESSION_PLACEHOLDER` · `ERR_CLI_SDD_SESSION_PAYLOAD_FILE` · `ERR_CLI_SDD_SESSION_FEASIBILITY`                     | Value Object | Payload and typed-transition error identifiers           |
| `ERR_CLI_SDD_SESSION_CHECKPOINT`                                                                                               | Value Object | Execute checkpoint transition error identifier           |
| `PLACEHOLDER_RE` · `SET_FIELDS`                                                                                                | Value Object | Generic validation vocabulary                            |
| `SessionOutcome` · `SetField`                                                                                                  | Type         | Command result and replaceable-field union               |
| `printHelp`                                                                                                                    | Utility      | Public command help                                      |

<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:MODULE_CONTRACTS-->

## 4. Module Contracts (DbC)

### 4.1 Typed Feasibility Transition

- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `unit`, `integration`

**Contract (DbC):**

- Preconditions:
  - An exact regular `specs/.sdd-session.md` is open
  - The content file is a bounded regular non-symlink UTF-8 file below `.claude/tmp/`
  - The payload is one JSON object with exact key set `schema`, `cycle`, `seq`, `event`, `payload`
- Postconditions:
  - All prior matching-schema journal events and the candidate event pass schema and transition fold
  - First result requires a retained non-empty worker ID
  - Every new result increments `resultCount` by exactly one and matches the latest target hashes
  - Result five cannot refresh, re-dispatch, or reach Gate 2 without operator disposition
  - `NEW_FORK` reaches Gate 2 as an unresolved typed delta
  - A Gate 2 mutation is refreshed and reviewed before close
  - `RESTART: reason` alone authorizes a fresh cycle with count 0, cap 5, and no worker
  - Success appends the event, consumes the payload, and prints one `NEXT=` line
  - Failure preserves both session and payload bytes

### 4.2 Retained Worker and Fallback

After the primary worker ID exists, `lost`/`unsupported` retain that ID. The first transition from
`fallbackUsed=false` to `true` may replace it with one live fallback ID. Once true, the ID can never
change again, including across another lost/unsupported state.

### 4.3 Execute Worker Checkpoint

`checkpoint` accepts exact `sdd-worker-checkpoint/v1` JSON only for an `intent: execute` session.
It validates monotonically increasing sequence/attempts, a stable retry budget, retained durable
decision/deviation refs that resolve to existing files/anchors, evidence, and a bounded technical
plan. The CLI owns budget `2`: first recovery is attempt 1 and exhaustion is accepted only after it;
`CONTEXT_ROTATION` preserves the current attempt and refs without consuming the budget. Recoverable results emit
`NEXT=AUTO_REPLAN_AND_CONTINUE`; only spec-goal conflict, external authority, or an exhausted retry
budget emit an operator `NEXT`. Generic `BLOCKED`/`FAIL`, malformed JSON, and stale sequence fail
without mutating the session or consuming the payload.

<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->

## 5. Public Options & Policies

| Form                                                                         | Meaning                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `open --intent <intent> [--scale <scale>]`                                   | Create the idempotent scratch                |
| `set <field> <value>`                                                        | Replace intent, scale, or open               |
| `log` · `workset` · `term`                                                   | Append/update generic human-readable context |
| `feasibility --content-file .claude/tmp/sdd-scaffold-feasibility-event.json` | Apply one typed scaffold transition          |
| `checkpoint --content-file .claude/tmp/sdd-worker-checkpoint-event.json`     | Apply one typed execute-worker transition    |
| `close`                                                                      | Remove the scratch                           |

Typed modes have no inline form. Exit 0 means accepted, 1 is file I/O, 2 is absent session or
invalid typed transition, and 4 is bad invocation.

<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->

## 6. File Structure

```text
cli/cmd/sdd-session/
├── sdd-session.cmd.ts
├── sdd-session.types.ts
├── feasibility-state.ts
├── worker-checkpoint.ts
├── help.ts
├── index.ts
└── __tests__/
```

<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->

## 7. Module Decision Log

### D-SS001 — Feasibility transitions are CLI-owned

- **Status:** active
- **Why:** draft.60 proved that a prose-only lifecycle lets the orchestrator lose results and worker
  identity. A pure fold gives every response one durable event and returns the only legal next action.
- **Risk:** the schema is intentionally scaffold-specific; a future lifecycle needs its own schema.

### D-SS002 — Event JSON is semantic, not textual

- **Status:** active
- **Why:** object-key and target-map insertion order do not change JSON meaning. The validator checks
  exact key sets and sorted target entries while examples retain a stable human-readable order.
- **Risk:** hashes still require exact lowercase SHA-256 strings.

### D-SS003 — Execute recovery transitions are checkpoint-owned

- **Status:** active
- **Why:** draft.60 showed that a worker's generic blocker can pause the operator or trigger an
  improvised Gennady repair. A typed checkpoint keeps evidence and bounded attempts durable while
  returning one autonomous replan transition or one of three explicit authority boundaries.
- **Risk:** the orchestrator still authors the bounded technical plan; deterministic authoring,
  feasibility, and task-plan checks validate it before redispatch.

<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:OPEN_RISKS-->

## 8. Open Risks

- The journal remains Markdown; only matching-schema JSON bullets participate in this fold.
- Event schema migration is fail-closed and needs an explicit future version.

<!--/SECTION:OPEN_RISKS-->
