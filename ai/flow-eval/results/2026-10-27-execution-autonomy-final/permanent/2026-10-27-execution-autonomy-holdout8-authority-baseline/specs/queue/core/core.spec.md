# Module: core

<!--SECTION:SPEC_ID-->
COR
<!--/SECTION:SPEC_ID-->

<!--SECTION:MODULE_VISION-->
## Module Vision
core owns deterministic rules for queue. Link: ../queue.spec.md
<!--/SECTION:MODULE_VISION-->

<!--SECTION:OVERVIEW-->
## Overview

```mermaid
flowchart LR
  caller --> Rules
  Rules --> caller
```
_Rules are pure and deterministic._
<!--/SECTION:OVERVIEW-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->
## Module Usage Example
A queue consumer asks for the first two jobs, receives a new ordered two-item array and retains its original queue.
<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:MODULE_REQUIREMENTS-->
## Requirements

### COR-REQ-1 [должен]
**Когда** a caller invokes selectBatch with valid inputs, **the module must** return the declared result: selectBatch receives an array of strings and a nonnegative integer capacity. Return a fresh array containing the first capacity entries, preserving order and duplicates and leaving the input unchanged. Reject a non-array, any non-string entry, or a capacity that is negative, fractional or non-finite with TypeError. A zero capacity returns an empty array.

### COR-REQ-2 [должен · нештатная]
**Если** input is invalid under the public contract, **то модуль должен** reject it with TypeError without hidden side effects.
<!--/SECTION:MODULE_REQUIREMENTS-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->
## Inter-Module Dependencies
- **Depends on:** none
- **Scope Reference (cross-scope):** none
- **Provides to:** fixture consumer
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:ENTITY_INVENTORY-->
| Name | Type | Purpose |
|---|---|---|
| selectBatch | Function | Validate and normalize one input. |
<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->
<details>
<summary>Entity surfaces</summary>

selectBatch: selectBatch receives an array of strings and a nonnegative integer capacity. Return a fresh array containing the first capacity entries, preserving order and duplicates and leaving the input unchanged. Reject a non-array, any non-string entry, or a capacity that is negative, fractional or non-finite with TypeError. A zero capacity returns an empty array.

</details>
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->
## Module Contracts

<details>
<summary>Public API contract</summary>

### selectBatch
- **Preconditions:** Runtime input is validated; TypeScript annotations alone are not validation.
- **Postconditions:** selectBatch receives an array of strings and a nonnegative integer capacity. Return a fresh array containing the first capacity entries, preserving order and duplicates and leaving the input unchanged. Reject a non-array, any non-string entry, or a capacity that is negative, fractional or non-finite with TypeError. A zero capacity returns an empty array.
- **Invariants:** No hidden I/O, no change to the approved accepted/rejected input set.

</details>
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->
## Public Options & Policies
Behavior is fixed by the approved contract; the fixture exposes no runtime options.

<details>
<summary>Options and policies</summary>

- No configurable options.

</details>
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure
```text
core/core.spec.md
src/queue.ts
```

**File Mapping:**
- `src/queue.ts`: rule implementation
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:RESEARCH-->
## Research

No research documents.
<!--/SECTION:RESEARCH-->

<!--SECTION:MODULE_DECISION_LOG-->
## Module Decision Log

<details>
<summary>Approval records</summary>

### Approval #1 — current specification set
- **Status:** approved
- **Reviewed set:** `specs/queue/queue.spec.md`, `specs/queue/core/core.spec.md`
- **Independent review:** clean
- **Operator decision:** approved
- **Recorded:** 2026-09-02

</details>
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:HANDOFF-->
## Handoff to Tasks
- **Implementation files to be created:** src/queue.ts
- **Test files to be created:** src/queue.test.ts
- **Stack dependencies:**
  - Language: `typescript`
  - Test framework: `node-test`
- **Module Rules Additions:** None
- **Open risks & validation needs:** none
<!--/SECTION:HANDOFF-->

<!-- Optional appendix — include only when the module has non-trivial post-impl learnings worth preserving. -->
<!--SECTION:IMPLEMENTATION_INSIGHTS-->
## Implementation Insights
The fixture has no non-trivial implementation caveats beyond its approved contracts.

<details>
<summary>Implementation notes</summary>

- Keep validation deterministic and input immutable.

</details>
<!--/SECTION:IMPLEMENTATION_INSIGHTS-->

<!--SDD_AUDIT_RECEIPT-->
```json
{
  "schema": 1,
  "kind": "audit",
  "group": "specs/queue/core/core.spec.md",
  "members": [
    "core.task.COR-work.md"
  ],
  "gitRef": "3acd3392e26892f1cd91f21387e881be8afbfe8c",
  "verdict": "PASS",
  "ts": "2026-10-27T12:14:36.382Z",
  "signature": "sha256:cf69741ffa86d81dd5949c95fa5c6fd42dde44a57520bfa4c4b44c1b20b558c6"
}
```
<!--/SDD_AUDIT_RECEIPT-->

<!--SDD_REVIEW_RECEIPT-->
```json
{
  "schema": 1,
  "kind": "review",
  "group": "specs/queue/core/core.spec.md",
  "members": [
    "core.task.COR-work.md"
  ],
  "gitRef": "3acd3392e26892f1cd91f21387e881be8afbfe8c",
  "verdict": "PASS",
  "ts": "2026-10-27T12:14:52.934Z",
  "signature": "sha256:cf69741ffa86d81dd5949c95fa5c6fd42dde44a57520bfa4c4b44c1b20b558c6"
}
```
<!--/SDD_REVIEW_RECEIPT-->
