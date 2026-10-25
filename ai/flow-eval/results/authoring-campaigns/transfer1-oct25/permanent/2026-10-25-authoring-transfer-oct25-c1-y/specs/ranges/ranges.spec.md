# ranges: library specification

<!--SECTION:SPEC_ID-->
RANGES
<!--/SECTION:SPEC_ID-->

<!--SECTION:SCOPE_TYPE-->
## scope-type
library
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision & Primary Goal
Pure ranges operations. Every range is an ordered pair [start,end] of finite safe integers with start <= end. Ranges are half-open: start is included and end excluded. Empty ranges start=end are valid. Validate all inputs before returning any result. No I/O or mutation.
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
```mermaid
flowchart LR
  caller --> purePolicy
```
_Local deterministic policy, no effects._
<!--/SECTION:OVERVIEW-->

<!--SECTION:GOLDEN_DX-->
## Target Experience
| Input | Outcome |
|---|---|
| `intersectRanges([0,3],[3,6])` | `null` |
| `intersectRanges([-4,2],[-1,5])` | `[-1,2]` |
| `intersectRanges([2,2],[0,9])` | `null` |
| `intersectRanges([5,1],[0,9])` | `TypeError` |
<!--/SECTION:GOLDEN_DX-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** infra-base
- **Provides to:** local pure callers.
[Tooling](../infra-base/infra-base.spec.md)
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints
### RAN-REQ-1 [должен]
**Когда** переданы допустимые входы, **модуль должен** соблюдать контракт: Return [max(left.start,right.start), min(left.end,right.end)] only when its start is strictly less than its end; otherwise return null. Touching or empty intersections are null. This entire behavior is already owned by the parent; the child introduces no new requirement.
> Preserve the declared boundary semantics.

### RAN-REQ-2 [должен · нештатная]
**Если** входы недопустимы, **то модуль должен** выбросить TypeError. Any non-safe-integer bound or reversed range throws TypeError, including when the other range is empty or the ranges are disjoint. Do not reorder or silently repair a reversed range.
> Invalid inputs are not ordinary negative results.

### Out-of-Scope
- Network, persistence, mutation and clock reads.

### Runtime & Deferred Scope
Not implemented; draft only.

### Rules
No additional activated rule set.
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:DATA_FLOW-->
## Data Flow
```mermaid
flowchart LR
  caller --> purePolicy
```
_Local deterministic policy, no effects._
<!--/SECTION:DATA_FLOW-->

<!--SECTION:PUBLIC_API_SURFACE-->
## Public API Surface
intersectRanges(left: [number,number], right: [number,number]): [number,number] | null
<!--/SECTION:PUBLIC_API_SURFACE-->

<!--SECTION:ARCHITECTURE-->
## Architecture
Pure functions without lifecycle, ports or adapters.
```mermaid
flowchart LR
  caller --> purePolicy
```
_Local deterministic policy, no effects._
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:MODULE_MAP-->
## Module Map
### Modules
- [intersection](intersection/intersection.spec.md) — planned pure operation.

### Inter-Module Dependency Map
No sibling dependencies.
<!--/SECTION:MODULE_MAP-->

<!--SECTION:RESEARCH-->
## Research
No research documents for this bounded operation.
<!--/SECTION:RESEARCH-->

<!--SECTION:DECISION_LOG-->
## Decision Log
<details><summary>Details</summary>
RAN-DL-1 — operator approval remains pending; no implementation authorized.
</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
No external bootstrap.
<details><summary>Audit</summary>The harness supplies local tooling.</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff to Modules
- **Status:** pending-operator
- **Operator decision:** pending
No tickets or implementation approved.
<!--/SECTION:HANDOFF-->
