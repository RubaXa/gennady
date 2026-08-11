# Task: TSK-176 — Deterministic full, delta and cross-review control plane

<!--SECTION:META-->

## 1. Meta

- **Task-ID:** TSK-176
- **Status:** [ ] TODO
- **Purpose:** Довести `inbox-pipeline` до role-invariant review control plane: sealed inputs, total Review Contract, trusted receipts, адресный bounded repair, fresh PASS и exact queue handoff.
- **Scope:** agent-inbox
- **Module:** inbox-pipeline
- **Dependencies:** TSK-173, TSK-174, TSK-175
- **Spec References:**
  - Inventory and surfaces: [closed-world inventory](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#3-entity-inventory-closed-world), [entity surfaces](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#4-entity-surfaces)
  - DbC: [module invariants and contracts](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#5-module-contracts-dbc)
  - Catalog and policies: [public options](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#6-public-options--policies)
  - Ownership boundary: [pipeline handoff](../../../specs/agent-inbox/inbox-pipeline/inbox-pipeline.spec.md#reviewpublicationhandoff), [queue guarded intent](../../../specs/agent-inbox/inbox-queue/inbox-queue.spec.md#reviewguardedintent)
  - Root constraints: [FR-006–009 and FR-044–054](../../../specs/agent-inbox/agent-inbox.spec.md#41-functional-requirements), [NFR-010–013](../../../specs/agent-inbox/agent-inbox.spec.md#42-non-functional-constraints)
- **Runtime Backing:** `real-runtime`
- **Verification Levels:** `contract`, `unit`, `integration`
- **Deferred Runtime Scope:** TSK-176 owns all runtime implementation and contract/unit/integration proof. TSK-183 owns required shippable-entry e2e for receipt store/local durability, recorder, validator, repair, freshness, orchestrator, delta, real-MR cross-review, synthesis and publication handoff. TSK-177 owns queue-side `ReviewGuardedIntent` acceptance/no-translation and execution of independent operator commands.

<!--/SECTION:META-->
<!--SECTION:PHASES_OVERVIEW-->

## 2. Phases Overview

| ID  | Kind     | Deps | Status |
| --- | -------- | ---- | ------ |
| P1  | refactor | —    | [ ]    |
| P2  | test     | P1   | [ ]    |

<!--/SECTION:PHASES_OVERVIEW-->

## 3. Phases

<!--SECTION:PHASE_P1-->

### P1 — refactor

- **Objective:** Реализовать закрытый pipeline inventory и единый fail-closed control loop без role-specific depth, agent-authored evidence или queue-owned сущностей.
- **Rules:**
  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)
- **Target Files:**
  - `services/agent-inbox/modules/inbox-pipeline/types/review-intent.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-input-classification.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-contract-slot.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-contract-input-mapping.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-evidence.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-runtime-receipt.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-coverage.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-completeness-verdict.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/types/review-publication-handoff.type.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-input-manifest.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-plan.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-contract.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-slot-schema-catalog.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-finding.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-artifact.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-receipt-consumption.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-repair-task.ts`
  - `services/agent-inbox/modules/inbox-pipeline/model/review-synthesis.ts`
  - `services/agent-inbox/modules/inbox-pipeline/ports/review-runtime-receipt-store.port.ts`
  - `services/agent-inbox/modules/inbox-pipeline/adapters/local-review-runtime-receipt-store.adapter.ts`
  - `services/agent-inbox/modules/inbox-pipeline/adapters/memory-review-runtime-receipt-store.adapter.ts`
  - `services/agent-inbox/modules/inbox-pipeline/planning/review-input-manifest-builder.ts`
  - `services/agent-inbox/modules/inbox-pipeline/planning/review-contract-compiler.ts`
  - `services/agent-inbox/modules/inbox-pipeline/receipts/review-runtime-receipt-recorder.ts`
  - `services/agent-inbox/modules/inbox-pipeline/review/review-orchestrator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/review/review-cross-reviewer.ts`
  - `services/agent-inbox/modules/inbox-pipeline/verification/review-delta-verifier.ts`
  - `services/agent-inbox/modules/inbox-pipeline/verification/review-freshness-gate.ts`
  - `services/agent-inbox/modules/inbox-pipeline/coverage/review-structural-validator.ts`
  - `services/agent-inbox/modules/inbox-pipeline/coverage/review-repair-coordinator.ts`
- **Inputs:** TSK-173/174/175 handoffs.
- **Exit:** Все §3 entities имеют canonical owner; compiler total-map-ит sealed manifest; только trusted receipts/artifacts закрывают slots; repair bounded и crash-resumable; synthesis/handoff недостижимы без fresh PASS.

<!--/SECTION:PHASE_P1-->
<!--SECTION:PHASE_P2-->

### P2 — test

- **Objective:** Доказать typing и runtime DbC всех pipeline boundaries, включая negative, trust-boundary, crash/replay и cross-module handoff cases.
- **Rules:**
  - [testing-common](../../../ai/directives/testing/common.xml)
  - [node-test](../../../ai/directives/testing/node-test.xml)
- **Target Files:**
  - `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-control-plane.contract.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-input-manifest-builder.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-contract-compiler.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-slot-schema-catalog.contract.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-runtime-receipt-store.contract.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-runtime-receipt-recorder.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-structural-validator.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-orchestrator.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-delta-verifier.integration.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-cross-reviewer.test.ts`
  - `test/agent-inbox/inbox-pipeline/review-publication-handoff.contract.test.ts`
- **Inputs:** P1 handoff.
- **Exit:** Все BDD cases имеют canonical test; incomplete/forged/stale inputs fail closed; fresh complete round публикует только exact handoff schema.

<!--/SECTION:PHASE_P2-->
<!--SECTION:BDD-->

## 4. Acceptance Criteria (BDD)

**Feature:** Детерминированный control plane над недоверенным review agent.

### Contract typing

**Scenario:** `ReviewIntent` typing is exhaustive [`contract`]

- **Given** closed full, delta, thread, cross-review and manual intent variants
- **When** boundary types are checked
- **Then** unsupported kind and delta without typed baseline cannot inhabit `ReviewIntent`

**Scenario:** `ReviewInputClassification` typing is versioned [`contract`]

- **Given** canonical input identity, classifier version, code and change-shape flags
- **When** a classification crosses the boundary
- **Then** missing version/code and unknown unbranded codes are rejected

**Scenario:** `ReviewContractSlot` typing is closed [`contract`]

- **Given** every slot and exact diagram kind
- **When** slot definitions are checked
- **Then** kind-specific schema, anchors, cardinality, dependencies and reuse policy are required and unions are exhaustive

**Scenario:** `ReviewContractInputMapping` typing has one terminal form [`contract`]

- **Given** a manifest input and contract version
- **When** mapping types are checked
- **Then** targets XOR compiler-owned NA is representable, while empty/dual terminal forms are rejected

**Scenario:** `ReviewEvidence` typing preserves source identity [`contract`]

- **Given** slot evidence and optional permitted reuse mappings
- **When** evidence types are checked
- **Then** manifest source version/digest, producer provenance and fragment identity are mandatory

**Scenario:** `ReviewRuntimeReceipt` typing is control-plane complete [`contract`]

- **Given** a typed tool operation
- **When** receipt types are checked
- **Then** contract/manifest/session/source/target/operation/outcome/sequence fields are mandatory and operation union is exhaustive

**Scenario:** `ReviewCoverage` typing accounts for every slot [`contract`]

- **Given** required and compiler-owned NA slots
- **When** coverage types are checked
- **Then** complete, missing, invalid and not-applicable sets are disjoint and no required slot is unaccounted

**Scenario:** `ReviewCompletenessVerdict` typing is fail-closed [`contract`]

- **Given** PASS, REPAIRABLE, BLOCKED and STALE variants
- **When** verdict types are checked
- **Then** each variant requires its own reasons/coverage/attempt data and unknown status is rejected exhaustively

**Scenario:** `ReviewRuntimeReceiptStorePort` typing separates receipt and consumption logs [`contract`]

- **Given** append, replay and read operations for both logs
- **When** port consumers compile
- **Then** sequence/acknowledgment results are typed, conflicting replay is not a success shape and no update/delete surface exists

**Scenario:** local receipt adapter satisfies the port [`contract`]

- **Given** `LocalReviewRuntimeReceiptStoreAdapter`
- **When** it is assigned to `ReviewRuntimeReceiptStorePort`
- **Then** all operations and failure unions match without narrowing or production-path escape

**Scenario:** memory receipt adapter satisfies the port [`contract`]

- **Given** `MemoryReviewRuntimeReceiptStoreAdapter`
- **When** it is assigned to `ReviewRuntimeReceiptStorePort`
- **Then** all operations and failure unions match and run-id namespace is mandatory

**Scenario:** `ReviewPublicationHandoff` typing is exact and closed [`contract`]

- **Given** the canonical pipeline publication handoff fields
- **When** boundary types are checked
- **Then** all exact fields and `ACCEPTED` status are required; missing, extra, renamed, defaulted and non-PASS forms are rejected

**Scenario Outline:** every referenced DbC public boundary has exact typing [`contract`]

- **Given** valid and malformed `<contract>` boundary inputs
- **When** its public operation is type-checked and invoked by the contract kit
- **Then** exact `<result>` output/status union is exhaustive and malformed input has no success shape

| contract                                 | result                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| `ReviewInputManifestBuilder`             | `SEALED \| BLOCKED` persisted result                        |
| `ReviewContractCompiler`                 | complete atomic contract or compilation BLOCKED             |
| `ReviewSlotSchemaCatalog`                | exact schema/code lookup or fail-closed unknown             |
| `ReviewRuntimeReceiptStorePort`          | typed append/replay/read acknowledgment                     |
| `LocalReviewRuntimeReceiptStoreAdapter`  | exact port result plus durable failure                      |
| `MemoryReviewRuntimeReceiptStoreAdapter` | exact port result plus isolated failure                     |
| `ReviewRuntimeReceiptRecorder`           | evidence-eligible outcome only after durable receipt ack    |
| `ReviewReceiptConsumption`               | idempotent append or conflicting/disallowed mapping         |
| `ReviewStructuralValidator`              | `PASS \| REPAIRABLE \| BLOCKED \| STALE` verdict            |
| `ReviewRepairCoordinator`                | targeted task, next verdict or exhausted BLOCKED            |
| `ReviewFreshnessGate`                    | protected transition or persisted STALE/failure             |
| `ReviewOrchestrator`                     | visible completed, blocked or stale round state             |
| `ReviewDeltaVerifier`                    | complete delta intent or persisted full fallback            |
| `ReviewCrossReviewer`                    | provenance-retaining recommendation input only              |
| `ReviewSynthesis`                        | immutable semantic input or rejected non-fresh construction |
| `ReviewPublicationHandoff`               | exact immutable `ACCEPTED` record or no handoff             |

### Manifest and contract compilation

**Scenario:** manifest seals a closed versioned input inventory [`integration`]

- **Given** changed files, entities, discussions and required sources for one `mr + head SHA + event cursor`
- **When** capture and classification complete
- **Then** every input has immutable canonical identity plus version/digest or captured bytes and deterministic change shape
- **And** slots, mappings, fallback and NA are absent from the manifest

**Scenario:** incomplete or mutable manifest blocks before agent launch [`integration`]

- **Given** a missing inventory member, missing/unknown classification code, capture failure or mutable source without fixed version
- **When** sealing runs
- **Then** one persisted BLOCKED result lists exact input IDs and no contract/agent task exists; no exception is lost outside the journal

**Scenario:** manifest determinism distinguishes known fallback classification [`integration`]

- **Given** identical captured versions/bytes and classifier version, including valid `UNKNOWN_FILE_CLASSIFICATION`
- **When** manifest is rebuilt or a new event creates a new manifest
- **Then** identical inputs yield identical inventory/classifications/change shape, while a new head/cursor yields a new immutable identity
- **And** valid unknown-file classification seals successfully and only the compiler owns its fallback

**Scenario:** compiler total-maps every manifest input atomically [`integration`]

- **Given** a sealed manifest and exact catalog/compiler versions
- **When** contract compilation runs
- **Then** each input maps to one or more stable slot IDs or one justified closed NA code
- **And** an unknown file receives `file-fallback:<path>` while a gap, duplicate slot ID, unknown code or targets+NA collision publishes no partial contract

**Scenario:** contract compilation is deterministic and agent-independent [`contract`]

- **Given** byte-equivalent manifest/intent/compiler/catalog versions
- **When** compilation repeats and agent output attempts to omit or redefine obligations
- **Then** stable IDs and semantic digest are byte-equivalent and agent output cannot alter slots, mappings, reuse or NA
- **And** goal, tests, changed files and discovered entities never receive unsupported silent NA

**Scenario:** six required review dimensions are exact and receipt-backed [`integration`]

- **Given** any participation signal and a compiled full or delta contract
- **When** the review plan executes
- **Then** goal and tests are always REQUIRED; architecture uses only `NA_NO_ARCHITECTURE_CHANGE`, specifications only `NA_NO_SPECIFICATION_SURFACE`, security only `NA_NO_SECURITY_SURFACE`, and optimality only `NA_NO_OPTIMALITY_SIGNAL` when not REQUIRED
- **And** every changed file and discovered entity is REQUIRED and cannot disappear behind NA
- **And** every required lens cites immutable sources read through trusted receipts; role changes only permission metadata

**Scenario:** slot schemas enforce semantic-shaped structure mechanically [`integration`]

- **Given** file, entity, discussion, lens and artifact-section slots
- **When** evidence is validated
- **Then** schema, source anchors and min/max cardinality hold
- **And** every entity includes identity, responsibility/behavior, dependencies, risks and test impact
- **And** wrong catalog version/digest, broken versioned anchor or under/over cardinality leaves the exact slot invalid

**Scenario:** evidence reuse is explicit and non-duplicative [`integration`]

- **Given** one fragment offered to multiple slots
- **When** reuse is denied, allowed or mechanically copied
- **Then** denied/copied generic evidence leaves exact slots invalid
- **And** allowed reuse creates a separate compiler-authorized consumption mapping for every slot

**Scenario:** diagram obligations have distinct structural predicates [`contract`]

- **Given** entity-set, behavior/architecture and runtime-flow change shapes
- **When** diagram slots are compiled and validated
- **Then** entity-dependency requires typed nodes/edges, before-after paired states/changed relations, and runtime-event-flow ordered actors/events/branches/outcomes
- **And** one generic diagram cannot satisfy multiple obligations without catalog-proven schema equivalence

### Trusted validation and repair

**Scenario:** incomplete, placeholder and duplicated output is rejected precisely [`integration`]

- **Given** empty headings, TODO text, placeholder Mermaid, wrong anchors/cardinality or duplicated generic fragments
- **When** structural validation runs without LLM judgment
- **Then** verdict is REPAIRABLE with exact missing/invalid slot IDs and reasons, never PASS

**Scenario:** agent self-report or forged receipt cannot prove reading [`integration`]

- **Given** an artifact saying “all sources read” plus agent-authored, foreign-contract, out-of-order or content-mismatched receipts
- **When** validator verifies source use
- **Then** every affected slot stays incomplete and spoof evidence is observable

**Scenario:** durable receipt acknowledgment precedes eligibility [`integration`]

- **Given** a control-plane-owned tool callback and injected append failure/crash boundary
- **When** recorder observes its content and outcome
- **Then** evidence becomes eligible only after durable monotonic receipt acknowledgment
- **And** sequence gap/duplicate/out-of-order append, torn/corrupt tail or namespace crossing fails closed; artifact overwrite cannot modify the independent receipt log

**Scenario:** consumption replay is idempotent but conflicting reuse fails closed [`integration`]

- **Given** an acknowledged receipt and compiler-owned reuse policy
- **When** same ID+digest, conflicting digest, duplicate forbidden use and permitted reuse are consumed
- **Then** exact replay is idempotent, conflicts never alter logs, and each permitted slot gets its own durable consumption record before completion
- **And** consumption acknowledgment failure never completes the slot even when the receipt itself is durable

**Scenario:** repair targets only current gaps [`integration`]

- **Given** complete and missing/invalid slots in one verdict
- **When** repair is planned and dispatched
- **Then** task contains only gap slot IDs, expected evidence types and source anchors for the same contract version
- **And** complete/NA/unrelated slots and foreign/stale contract versions reject the task rather than expanding it

**Scenario:** repair attempts are monotonic, resumable and bounded [`integration`]

- **Given** default `maxRepairAttempts=3`, crashes/retries and repeated invalid output
- **When** coordinator resumes the round
- **Then** attempts are persisted before dispatch, never reset, and attempt four is not launched
- **And** crash after increment resumes the same unfinished task without duplicate attempt or repeated complete slots; round becomes recoverable BLOCKED with provenance and remaining slot IDs

**Scenario:** operator continuation preserves provenance [`unit`]

- **Given** a budget-exhausted BLOCKED round
- **When** operator starts a new round or increases budget
- **Then** a new round receives new identity, while budget increase above current counter preserves existing counter/history and no implicit or automatic continuation occurs

### Freshness, semantics and publication

**Scenario:** freshness is checked at all three local boundaries [`integration`]

- **Given** a manifest and newest locally observed head/cursor
- **When** VERDICT, SYNTHESIS_PUBLICATION and QUEUE_HANDOFF guards run
- **Then** each uses a core-owned per-MR serialized transaction and records protected transition only on exact match
- **And** mismatch/unknown purpose/read-persist ambiguity records STALE or fail-closed failure without invoking guarded callback
- **And** different MR continue independently; this local guard neither creates a global mutex nor claims atomicity with GitLab

**Scenario:** synthesis and handoff require fresh PASS [`integration`]

- **Given** missing, invalid, REPAIRABLE, BLOCKED, STALE or semantically unfinished round state
- **When** orchestration or a manual trigger reaches synthesis/publication
- **Then** no synthesis, recommendation publication, approve input or queue handoff is produced
- **And** only evidence from the same fresh manifest/contract is accepted; conflicts remain visible, structural PASS does not auto-agree, and synthesis owns no proposal/package/effect identity

**Scenario:** exact fresh handoff is immutable and replayable [`contract`]

- **Given** fresh PASS and successful QUEUE_HANDOFF guard
- **When** `ReviewPublicationHandoff` is constructed
- **Then** it contains exact `handoffId`, `manifestKey`, `manifestRef`, `contractRef`, `verdictRef`, `guardedTransitionId`, `acceptedObservedRevision`, action-specific `capabilitySnapshot`, `capabilityVersion`, `dispatchPolicy`, `recommendationDigest`, `provenance` and `deliveryStatus=ACCEPTED`
- **And** same identity replays byte-equivalent while mismatch/default/translation fails closed

**Scenario:** independent operator command remains separately eligible [`contract`]

- **Given** an explicit operator command with zero references to artifacts, findings or proposals of the incomplete round
- **When** pipeline classifies its relationship to FR-048 completeness gate
- **Then** the round gate does not block the command, while its own permission and policy gates remain mandatory
- **And** queue execution and proof are deferred to TSK-177

**Scenario:** delta and lane failures preserve complete work [`integration`]

- **Given** stored, missing or stale baseline, running old revision, newer pending events and one failed lane
- **When** delta orchestration runs
- **Then** valid evidence is explicitly revalidated, missing/ambiguous baseline forces full review, pending work supersedes only older pending work, and lane failure remains visible/retryable

**Scenario:** foreign approval or discussion is independently cross-reviewed [`unit`]

- **Given** a versioned foreign approval or discussion with agreement, incomplete prior review, disagreement or author refusal
- **When** cross-review executes against current code/context
- **Then** reaction, supplement, objection/question and agree+resolve alternatives retain both foreign and independent provenance
- **And** foreign approval cannot close a structural slot or auto-justify an approve recommendation without the normal fresh evidence/receipt gates

**Scenario:** approval and refusal preserve blocking semantics [`unit`]

- **Given** prior approval with open thread, later explicit override and author refusal
- **When** findings and thread recommendations are synthesized after fresh PASS
- **Then** approval implies non-blocking until override and refusal offers agree+resolve, object or ask without silently changing operator intent

<!--/SECTION:BDD-->
<!--SECTION:VERIFICATION-->

## 5. Verification

| Command                                                                                                                                                                                                                                                                                                                                                    | Required by                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run type-check`                                                                                                                                                                                                                                                                                                                                       | typescript-rules                                                  |
| `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-pipeline`                                                                                                                                                                                                                                                                                  | typescript-rules: scoped DbC, headers and code-anchor pairing     |
| `npx tsx cli/gennady.ts lint test/agent-inbox/inbox-pipeline`                                                                                                                                                                                                                                                                                              | testing-common, node-test: scoped test headers and anchor pairing |
| `! rg --follow --no-heading -n -e "^\s*enum " -e "^\s*namespace " -e "^\s*private " -e "#[a-zA-Z_]+\s*[:=]" -e "\bconsole\." -t ts services/agent-inbox/modules/inbox-pipeline`                                                                                                                                                                            | typescript-rules: forbidden constructs                            |
| `node --import tsx --test --experimental-test-module-mocks test/agent-inbox/inbox-pipeline/*.test.ts`                                                                                                                                                                                                                                                      | testing-common, node-test: scoped tests                           |
| `node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage test/agent-inbox/inbox-pipeline/*.test.ts`                                                                                                                                                                                                                         | testing-common, node-test: contract coverage                      |
| `! rg --no-heading -n -e "Step \d" -e "\.message.*\.includes\(" -e "let\s+threw\s*=" -t ts test/agent-inbox/inbox-pipeline`                                                                                                                                                                                                                                | node-test: forbidden test patterns                                |
| `npx prettier --check services/agent-inbox/modules/inbox-pipeline test/agent-inbox/inbox-pipeline tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md tasks/agent-inbox/README.md`                                                                                                                                                                 | changed production/tests/ticket/tracker format                    |
| `for sdd_section in META PHASES_OVERVIEW PHASE_P1 PHASE_P2 BDD VERIFICATION TEST_COVERAGE EXECUTION_LOG; do test "$(rg -c "^<!--SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md)" = 1 && test "$(rg -c "^<!--/SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md)" = 1; done` | normative task-anchor check                                       |
| `ai/skills/sdd-execute/scripts/sdd check --task TSK-176`                                                                                                                                                                                                                                                                                                   | SDD ticket/tracker/DAG integrity                                  |
| `git diff --check -- services/agent-inbox/modules/inbox-pipeline test/agent-inbox/inbox-pipeline tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md tasks/agent-inbox/README.md`                                                                                                                                                                  | changed-scope diff integrity                                      |

- **Task-specific Completion additions:** every manifest input is accounted; every required slot has trusted source-use receipts and a terminal state; all six dimensions and typed diagram obligations are independently evidenced; no fresh PASS means no synthesis/handoff. Any red scoped test, coverage execution, uncovered public happy/boundary/failure contract, lint, forbidden-pattern, anchor, format or diff gate blocks completion rather than becoming a skip.

<!--/SECTION:VERIFICATION-->
<!--SECTION:TEST_COVERAGE-->

## 6. Test Scenario Coverage

- `ReviewIntent` typing is exhaustive `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewIntent variants and baseline are exhaustive`
- `ReviewInputClassification` typing is versioned `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewInputClassification requires canonical versioned codes`
- `ReviewContractSlot` typing is closed `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewContractSlot kinds schemas and diagrams are exhaustive`
- `ReviewContractInputMapping` typing has one terminal form `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewContractInputMapping is targets xor justified NA`
- `ReviewEvidence` typing preserves source identity `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewEvidence requires immutable source and producer provenance`
- `ReviewRuntimeReceipt` typing is control-plane complete `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewRuntimeReceipt fields and operations are exhaustive`
- `ReviewCoverage` typing accounts for every slot `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewCoverage terminal sets are disjoint and total`
- `ReviewCompletenessVerdict` typing is fail-closed `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-types.contract.test.ts` :: `ReviewCompletenessVerdict variants are exhaustive and status-specific`
- `ReviewRuntimeReceiptStorePort` typing separates receipt and consumption logs `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-runtime-receipt-store.contract.test.ts` :: `receipt store port has typed append replay read and no mutation surface`
- local receipt adapter satisfies the port `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-runtime-receipt-store.contract.test.ts` :: `local receipt adapter satisfies exact port contract`
- memory receipt adapter satisfies the port `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-runtime-receipt-store.contract.test.ts` :: `memory receipt adapter satisfies exact isolated port contract`
- `ReviewPublicationHandoff` typing is exact and closed `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-publication-handoff.contract.test.ts` :: `pipeline handoff type requires the exact closed publication schema`
- every referenced DbC public boundary has exact typing `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-control-plane.contract.test.ts` :: `all referenced DbC boundaries expose exact exhaustive result contracts`
- manifest seals a closed versioned input inventory `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-input-manifest-builder.integration.test.ts` :: `sealed manifest owns every versioned input classification and no contract policy`
- incomplete or mutable manifest blocks before agent launch `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-input-manifest-builder.integration.test.ts` :: `manifest gaps persist BLOCKED before contract or agent launch`
- manifest determinism distinguishes known fallback classification `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-input-manifest-builder.integration.test.ts` :: `manifest determinism accepts known unknown-file code but rejects unknown codes`
- compiler total-maps every manifest input atomically `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-contract-compiler.integration.test.ts` :: `compiler atomically maps every input with fallback or justified NA`
- contract compilation is deterministic and agent-independent `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-contract-compiler.integration.test.ts` :: `compiler output is byte-equivalent and cannot be changed by agent output`
- six required review dimensions are exact and receipt-backed `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-orchestrator.integration.test.ts` :: `goal architecture specifications tests security and optimality read immutable sources through receipts`
- slot schemas enforce semantic-shaped structure mechanically `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-slot-schema-catalog.contract.test.ts` :: `all slot schemas enforce fields anchors and cardinality`
- evidence reuse is explicit and non-duplicative `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-structural-validator.integration.test.ts` :: `reuse requires catalog permission and separate durable consumption`
- diagram obligations have distinct structural predicates `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-slot-schema-catalog.contract.test.ts` :: `three diagram schemas reject generic substitution`
- incomplete, placeholder and duplicated output is rejected precisely `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-structural-validator.integration.test.ts` :: `validator reports exact gaps for empty placeholder malformed and duplicate output`
- agent self-report or forged receipt cannot prove reading `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-structural-validator.integration.test.ts` :: `self report forged foreign out of order and mismatched receipts close no slot`
- durable receipt acknowledgment precedes eligibility `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-runtime-receipt-recorder.integration.test.ts` :: `durable receipt acknowledgment precedes evidence eligibility`
- consumption replay is idempotent but conflicting reuse fails closed `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-runtime-receipt-store.contract.test.ts` :: `consumption replay is idempotent and conflicts preserve append only logs`
- repair targets only current gaps `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts` :: `repair contains only current missing and invalid slots`
- repair attempts are monotonic, resumable and bounded `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts` :: `default three attempts survive crash and block attempt four`
- operator continuation preserves provenance `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-repair-coordinator.integration.test.ts` :: `new round and budget increase preserve distinct counter provenance`
- freshness is checked at all three local boundaries `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-freshness-gate.integration.test.ts` :: `verdict publication and handoff are separately guarded by exact observed revision`
- synthesis and handoff require fresh PASS `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-orchestrator.integration.test.ts` :: `no incomplete blocked stale or semantically unfinished round publishes downstream`
- exact fresh handoff is immutable and replayable `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-publication-handoff.contract.test.ts` :: `fresh handoff has exact immutable fields digest and replay behavior`
- independent operator command remains separately eligible `[contract-only]` → `test/agent-inbox/inbox-pipeline/review-control-plane.contract.test.ts` :: `zero round references bypass only the completeness gate and retain own policy gates`
- delta and lane failures preserve complete work `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-delta-verifier.integration.test.ts` :: `delta fallback supersede revalidation and lane failure preserve all gaps`
- foreign approval or discussion is independently cross-reviewed `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-cross-reviewer.test.ts` :: `versioned foreign review retains dual provenance without structural or approve shortcut`
- approval and refusal preserve blocking semantics `[simulation-backed]` → `test/agent-inbox/inbox-pipeline/review-cross-reviewer.test.ts` :: `approval override and refusal retain explicit non blocking semantics`

### Deferred Test Ownership

- Deferred Test Ownership: TSK-177 `[simulation-backed]` → `review-guarded-intent.contract.test.ts` :: `queue accepts and replays exact publication handoff without translation defaults or recomputation`; dependency remains TSK-176 → TSK-177.
- Deferred Test Ownership: TSK-177 `[simulation-backed]` → `review-independent-command.integration.test.ts` :: `zero current round refs require queue permission allowlist freshness and provider gates only`; hidden/nonzero/unknown refs case proves zero effect.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `receipt store e2e persists append read replay and profile isolation`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `local receipt adapter e2e proves durable ack and corrupt-tail failure`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `receipt recorder e2e preserves callback provenance outside artifacts`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `structural validator e2e rejects gaps then passes real evidence`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `repair coordinator e2e resumes and exhausts budget honestly`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `freshness gate e2e protects all three purposes`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `orchestrator e2e exposes complete blocked and stale rounds`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `delta verifier e2e proves complete delta and full fallback`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `real MR cross-review e2e preserves dual provenance`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `synthesis e2e exists only after fresh PASS`.
- Deferred Test Ownership: TSK-183 `[e2e-required]` → `agent-inbox.pipeline-control-plane.spec.ts` :: `publication handoff e2e is exact after fresh PASS`.

<!--/SECTION:TEST_COVERAGE-->
<!--SECTION:EXECUTION_LOG-->

## 7. Execution Log

### Round 1 — 2026-08-10, initial

#### P1

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npx tsx cli/gennady.ts lint services/agent-inbox/modules/inbox-pipeline` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `! rg --follow --no-heading -n -e "^\s*enum " -e "^\s*namespace " -e "^\s*private " -e "#[a-zA-Z_]+\s*[:=]" -e "\bconsole\." -t ts services/agent-inbox/modules/inbox-pipeline` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npx prettier --check services/agent-inbox/modules/inbox-pipeline tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md tasks/agent-inbox/README.md` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2

- [ ] `<ts>` ver `npm run type-check` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npx tsx cli/gennady.ts lint test/agent-inbox/inbox-pipeline` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `node --import tsx --test --experimental-test-module-mocks test/agent-inbox/inbox-pipeline/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage test/agent-inbox/inbox-pipeline/*.test.ts` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `! rg --no-heading -n -e "Step \d" -e "\.message.*\.includes\(" -e "let\s+threw\s*=" -t ts test/agent-inbox/inbox-pipeline` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `npx prettier --check services/agent-inbox/modules/inbox-pipeline test/agent-inbox/inbox-pipeline tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md tasks/agent-inbox/README.md` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `for sdd_section in META PHASES_OVERVIEW PHASE_P1 PHASE_P2 BDD VERIFICATION TEST_COVERAGE EXECUTION_LOG; do test "$(rg -c "^<!--SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md)" = 1 && test "$(rg -c "^<!--/SECTION:${sdd_section}-->$" tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md)" = 1; done` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `ai/skills/sdd-execute/scripts/sdd check --task TSK-176` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` ver `git diff --check -- services/agent-inbox/modules/inbox-pipeline test/agent-inbox/inbox-pipeline tasks/agent-inbox/inbox-pipeline/inbox-pipeline.task-176.md tasks/agent-inbox/README.md` → `<pass|fail>` exit=`<code>`
- [ ] `<ts>` DONE
      **Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close

- [ ] `<ts>` DONE

<!--/SECTION:EXECUTION_LOG-->

## 8. Decision Log

- **D-176-01 — refine existing TODO ticket:** TSK-176 и зависимости сохранены; новый параллельный ticket не создан, потому что refined control plane целиком принадлежит существующему `inbox-pipeline` unit.
- **D-176-02 — one coherent module ticket:** manifest, compiler, receipts, validator, repair, freshness and handoff остаются двумя последовательными impl/test phases; splitting создаёт hard-dependency overhead без parallel/context justification.
- **D-176-03 — exact queue boundary without dependency inversion:** pipeline доказывает только exact immutable `ReviewPublicationHandoff` shape/replay. Queue-side `ReviewGuardedIntent` assignability, no-translation acceptance, proposals/packages/effects и independent-command execution принадлежат зависимому TSK-177.
- **D-176-04 — honest runtime fidelity:** TSK-176 materializes only `contract-only` and `simulation-backed` runner proof while implementing real runtime hooks; all module-required shippable-entry e2e cases are explicitly owned by TSK-183. Red coverage or any other required gate blocks completion.
- **BDD critic — merged 1/12 manifest:** closed versioned inventory, deterministic rebuild, persisted capture failures, immutable new-event identity, mutable-source rejection и различие unknown code от валидного `UNKNOWN_FILE_CLASSIFICATION`.
- **BDD critic — merged 2/12 compiler:** atomic total mapping, targets-XOR-NA, file fallback, six dimensions, prohibited silent NA, collision/gap/unknown-code rejection, deterministic digest и agent-independent policy ownership.
- **BDD critic — merged 3/12 slot contracts:** exact schema/catalog digest, versioned anchors, min/max cardinality, five mandatory entity fields, deny-by-default reuse и отдельные durable mappings.
- **BDD critic — merged 4/12 diagrams:** отдельные predicates для `entity-dependency`, `before-after`, `runtime-event-flow`; placeholder/generic substitution не закрывает slots.
- **BDD critic — merged 5/12 validator:** empty/placeholder/duplicate/schema/anchor/cardinality matrix возвращает exact gaps; self-report не evidence; PASS не означает semantic truth.
- **BDD critic — merged 6/12 receipts:** full control-plane context, durable ack before eligibility, spoof/foreign/order/content rejection, idempotent/conflicting replay, corrupt-tail failure и profile namespace isolation.
- **BDD critic — merged 7/12 consumption:** независимый append-only sequence, отдельный durable ack, conflicting/disallowed reuse fail-closed и отдельная запись для каждого permitted slot.
- **BDD critic — merged 8/12 repair:** missing/invalid-only scope, foreign/stale rejection, persist-before-dispatch, crash-resume, default-three exhaustion, explicit new-round/budget decision without implicit reset.
- **BDD critic — merged 9/12 freshness:** отдельная проверка трёх purposes, no-callback stale/failure path, per-MR independence, action-specific capability handoff и отсутствие обещания GitLab atomicity.
- **BDD critic — merged 10/12 publication gate:** incomplete/blocked/stale/manual paths не обходят fresh PASS; synthesis принимает только same-manifest evidence, сохраняет conflicts и не владеет queue identities.
- **BDD critic — merged 11/12 handoff:** exact required field set, `ACCEPTED` only и byte-equivalent pipeline replay; queue compatibility/no-translation proof routed to TSK-177 without reversing the DAG.
- **BDD critic — merged 12/12 typing:** отдельные type scenarios плюс executable matrix всех 16 DbC public boundaries; оба adapters являются отдельными rows общего port kit.
- **BDD critic — rejected as out of scope:** queue-internal proposal/package/effect execution и GitLab reconciliation (TSK-177/174), UI behavior (TSK-182), semantic truth scoring, distributed/global locking, новые entities/statuses/codes/schemas и неописанная точная инициализация counter нового round. Existing cross-review alternatives retained only as FR-008/026 behavior, not as LLM truth proof.
