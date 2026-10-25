# infra-base: infrastructure specification

<!--SECTION:SPEC_ID-->
INFRA-BASE
<!--/SECTION:SPEC_ID-->

<!--SECTION:SCOPE_TYPE-->
## scope-type
infrastructure
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision
Provide local Node.js and the installed Gennady CLI for draft authoring, not domain behavior.
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
```mermaid
flowchart LR
  author --> localCLI
  localCLI --> draft
```
_Local authoring only._
<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** None
- **Provides to:** pure-domain draft scopes.
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints
### IB-REQ-1 [должен]
**Когда** создаётся черновик, **окружение должно** предоставлять установленный Gennady CLI без registry downloads.
> Reproducible local tooling.

### IB-REQ-2 [должен · нештатная]
**Если** CLI недоступен, **автор должен** остановиться и сообщить ошибку без установки замены.
> No fabricated tooling success.

### Out-of-Scope
- Product algorithms and implementation.

### Runtime & Deferred Scope
Harness supplies tooling; no execution receipt.

### Rules
No extra activated rule set.
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:TOOL_STACK-->
## Tool Stack
| Tool | Role |
|---|---|
| Node.js 22 | Local runtime |
| Installed Gennady CLI | Authoring |
<!--/SECTION:TOOL_STACK-->

<!--SECTION:WORKFLOW_EXAMPLE-->
## Developer Workflow Example
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
<!--/SECTION:WORKFLOW_EXAMPLE-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:EFFECTIVE_RULES-->
## Effective Rules (for cascade)
<details><summary>Details</summary>
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
</details>
<!--/SECTION:EFFECTIVE_RULES-->

<!--SECTION:VERIFICATION_COMMANDS-->
## Verification Commands
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
<!--/SECTION:VERIFICATION_COMMANDS-->

<!--SECTION:RESEARCH-->
## Research
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
<!--/SECTION:RESEARCH-->

<!--SECTION:DECISION_LOG-->
## Decision Log
<details><summary>Details</summary>
IB-DL-1 — local installed tooling only; no operator approval exists.
</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
<details><summary>Details</summary>
Local authoring tooling only; product algorithms are outside this owner. No implementation or verification result is claimed.
</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff
- **Status:** pending-operator
- **Operator decision:** pending
<!--/SECTION:HANDOFF-->
