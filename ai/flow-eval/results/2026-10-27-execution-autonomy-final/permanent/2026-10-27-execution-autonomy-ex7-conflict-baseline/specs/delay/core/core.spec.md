# Module: core

<!--SECTION:SPEC_ID-->
COR
<!--/SECTION:SPEC_ID-->

<!--SECTION:MODULE_VISION-->
## Module Vision
core owns deterministic rules for delay. Link: ../delay.spec.md
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
A caller with a 200ms request and 50ms limit immediately receives 50ms; no timer is started.
<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:MODULE_REQUIREMENTS-->
## Requirements

### COR-REQ-1 [должен]
**Когда** a caller invokes boundedDelay with valid inputs, **the module must** return the declared result: boundedDelay receives value and limit in milliseconds. For finite nonnegative numbers return the smaller number, including zero. Reject a non-number, non-finite number or negative argument with RangeError. Never wait, sleep, perform I/O or mutate input. Error message text and internal implementation are not otherwise prescribed.

### COR-REQ-2 [должен · нештатная]
**Если** input is invalid under the public contract, **то модуль должен** reject it with RangeError without hidden side effects.
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
| boundedDelay | Function | Validate and normalize one input. |
<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->
<details>
<summary>Entity surfaces</summary>

boundedDelay: boundedDelay receives value and limit in milliseconds. For finite nonnegative numbers return the smaller number, including zero. Reject a non-number, non-finite number or negative argument with RangeError. Never wait, sleep, perform I/O or mutate input. Error message text and internal implementation are not otherwise prescribed.

</details>
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->
## Module Contracts

<details>
<summary>Public API contract</summary>

### boundedDelay
- **Preconditions:** Runtime input is validated; TypeScript annotations alone are not validation.
- **Postconditions:** boundedDelay receives value and limit in milliseconds. For finite nonnegative numbers return the smaller number, including zero. Reject a non-number, non-finite number or negative argument with RangeError. Never wait, sleep, perform I/O or mutate input. Error message text and internal implementation are not otherwise prescribed.
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
src/delay.ts
```

**File Mapping:**
- `src/delay.ts`: rule implementation
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
- **Reviewed set:** `specs/delay/delay.spec.md`, `specs/delay/core/core.spec.md`
- **Independent review:** clean
- **Operator decision:** approved
- **Recorded:** 2026-09-02

</details>
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:HANDOFF-->
## Handoff to Tasks
- **Implementation files to be created:** src/delay.ts
- **Test files to be created:** src/delay.test.ts
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
