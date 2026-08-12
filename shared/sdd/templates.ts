// @file: Single source of truth for SDD v2 artifact skeletons (product/library/infrastructure/interface/module/task/portal specs) — backs check.ts's derived required/fold section lists and the `gennady sdd-new` scaffolder.
// @consumers: check.ts, sdd-new.cmd
// @tasks: N/A

/**
 * @purpose Every artifact kind the registry knows how to scaffold.
 */
export type ArtifactKind =
  | 'product'
  | 'library'
  | 'infrastructure'
  | 'interface'
  | 'module'
  | 'task'
  | 'module-index'
  | 'scope-index'
  | 'project-index'
  | 'portal';

/**
 * @purpose Scope-type kinds — the four `scope-type` values a top-level `<scope>.spec.md` can carry.
 */
export const SCOPE_KINDS = ['product', 'library', 'infrastructure', 'interface'] as const;

/**
 * @purpose One entry in a template's section manifest — what an agent must know to fill the section.
 * @invariant `loadBearing` is the subset of `required` check.ts's gate enforces — e.g. OVERVIEW is
 * `required:true` but `loadBearing:false` (gated via `SDD_NO_DIAGRAM_BLOCK`), so derived exports stay exact.
 */
export type SectionManifestEntry = {
  /** @purpose Anchor name (`^[A-Z][A-Z0-9_]*$`) for anchored artifacts; plain identifier for portal (no anchors). */
  name: string;
  /** @purpose Whether the contract expects this section to be filled (not necessarily mechanically gated). */
  required: boolean;
  /** @purpose Whether this section is in today's mechanical required-section gate (check.ts). Subset of `required`. */
  loadBearing: boolean;
  /** @purpose Whether the section body must fold its detail under `<details>` (AX_SPEC_PROGRESSIVE_DISCLOSURE), per today's `FOLD_REQUIRED_V2` gate. */
  fold: boolean;
  /** @purpose 1-2 sentences telling the agent what to write in this section. */
  fill: string;
};

/**
 * @purpose One artifact kind's full template: literal skeleton, section manifest, and path convention.
 */
export type ArtifactTemplate = {
  /** @purpose Which artifact kind this template scaffolds. */
  kind: ArtifactKind;
  /** @purpose Literal markdown skeleton — copied verbatim from the canonical contract (ai/kit/contract/**). */
  skeleton: string;
  /** @purpose Section manifest, top-level sections in document order. */
  sections: SectionManifestEntry[];
  /** @purpose Path convention for this artifact kind, with `<scope>`/`<module>`/`<ACR>`/`<slug>` placeholders. */
  pathPattern: string;
};

// #region START_SHARED_SECTIONS — text shared verbatim by every scope-type template
const DECISION_LOG_FILL =
  'One-line human summary of how many decisions and what area; fold the full D-NNN entries under <details> per AX_SPEC_PROGRESSIVE_DISCLOSURE.';
const BOOTSTRAP_REQUIREMENTS_FILL =
  'One-line human summary of outstanding prerequisites; fold the full Requirement/Kind/Owner/Resolution table under <details>. Declare explicitly ("No external bootstrap required.") when the STEP_7 audit found none — do not leave the table silently empty.';
const OVERVIEW_FILL =
  'MANDATORY (AX_SPEC_MANDATORY_DIAGRAM): at least one fenced mermaid or ASCII diagram giving a reader the shape of this artifact at a glance, up top.';
const SCOPE_DEPENDENCIES_FILL_PRODUCT =
  'List infra-*/api/design-system-* scopes this scope depends on, and any consumer scopes it provides to.';
// #endregion END_SHARED_SECTIONS

// #region START_PRODUCT — specs/<scope>/<scope>.spec.md, scope-type=product
const PRODUCT_SKELETON = `# <scope-name>: Scope Specification

<!--SECTION:SCOPE_TYPE-->
## scope-type
product
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision & Primary Goal
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
[MANDATORY per \`AX_SPEC_MANDATORY_DIAGRAM\` — ≥1 diagram right up top so a reader grasps the scope at a glance (checked by \`SDD_NO_DIAGRAM_BLOCK\` / \`SDD_DIAGRAM_BLOCK_EMPTY\`). The floor is one system-context / high-level view; add more (user flow, data flow) by author judgment. Fenced mermaid OR ASCII; pick the diagram type per \`formats/diagram-vocabulary.xml\`. Example:]

\`\`\`mermaid
flowchart TD
  user --> product
  product --> dep1[dependency]
  product --> dep2[dependency]
\`\`\`
<!--/SECTION:OVERVIEW-->

<!--SECTION:PROJECT_TYPE-->
## Project Type
- **Type:** app[mobile|desktop|spa] | service-module-sdk | cli-utility
- **Why this type:** [Краткое обоснование.]
<!--/SECTION:PROJECT_TYPE-->

<!--SECTION:GOLDEN_DX-->
## Target Experience
[Commentary-rich: init/setup + happy path + error/degradation path.]
<!--/SECTION:GOLDEN_DX-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** [infra-*, api, design-system-* scopes]
- **Provides to:** [consumer scopes, if any]
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints

### Functional Requirements

### Non-Functional Constraints

### Out-of-Scope

### Runtime & Deferred Scope
[Per \`AX_RUNTIME_BACKING_EXPLICIT\`. Backing per major capability + deferred parts + trust boundaries требующие real runtime hook.]

### Rules
| Rule | Category | Source |
|---|---|---|
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:ARCHITECTURE-->
## High-Level Architecture
[Выбранный вариант. Block diagram. Краткие описания.]

### Rejected Alternatives
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:MODULE_MAP-->
## Module Map
[Appended by \`module-decomposition\`. Initially: «Modules not yet decomposed — run \`module-decomposition <scope-name>\`».]
<!--/SECTION:MODULE_MAP-->

<!--SECTION:DECISION_LOG-->
## Decision Log
[One-line human summary — how many decisions, what area. Full entries fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`) — history, never needed to grasp the scope NOW.]

<details>
<summary>Полные записи Decision Log</summary>

[D-NNN entries.]

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
[One-line human summary — is anything outstanding. Full table folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
<!-- Empty list allowed only when STEP_7 audit produced zero external assumptions — declare explicitly. -->

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff to Modules
- **Primary input:** \`specs/<scope-name>/<scope-name>.spec.md\`
- **Areas requiring decomposition:** [list]
- **Named abstractions:** [from Target Experience]
- **Bootstrap tickets ready for cascade:** see Prerequisites
- **Open risks:** [validation needs]

<!-- Pivot Invalidation List — only in pivot mode -->
<!--/SECTION:HANDOFF-->
`;

const PRODUCT_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'SCOPE_TYPE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: "Literal value `product` — identifies this spec's scope-type to REQUIRED_SECTIONS checks.",
  },
  {
    name: 'VISION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Vision & primary goal — what this product scope is for, in a sentence or two.',
  },
  { name: 'OVERVIEW', required: true, loadBearing: false, fold: false, fill: OVERVIEW_FILL },
  {
    name: 'PROJECT_TYPE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Pick the project Type (app[mobile|desktop|spa] | service-module-sdk | cli-utility) and one-line rationale.',
  },
  {
    name: 'GOLDEN_DX',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Target experience: init/setup + happy path + error/degradation path, commentary-rich.',
  },
  {
    name: 'SCOPE_DEPENDENCIES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: SCOPE_DEPENDENCIES_FILL_PRODUCT,
  },
  {
    name: 'REQUIREMENTS_AND_CONSTRAINTS',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Functional Requirements, Non-Functional Constraints, Out-of-Scope, Runtime & Deferred Scope (AX_RUNTIME_BACKING_EXPLICIT), and the Rules table.',
  },
  {
    name: 'ARCHITECTURE',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Chosen high-level architecture with a block diagram and brief descriptions, plus Rejected Alternatives.',
  },
  {
    name: 'MODULE_MAP',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Appended by module-decomposition; initially a placeholder pointing at that command.',
  },
  { name: 'DECISION_LOG', required: true, loadBearing: true, fold: true, fill: DECISION_LOG_FILL },
  {
    name: 'BOOTSTRAP_REQUIREMENTS',
    required: true,
    loadBearing: false,
    fold: true,
    fill: BOOTSTRAP_REQUIREMENTS_FILL,
  },
  {
    name: 'HANDOFF',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Primary input path, areas requiring decomposition, named abstractions, bootstrap tickets, open risks.',
  },
];
// #endregion END_PRODUCT

// #region START_LIBRARY — specs/<scope>/<scope>.spec.md, scope-type=library
const LIBRARY_SKELETON = `# <scope-name>: Library Specification

<!--SECTION:SCOPE_TYPE-->
## scope-type
library
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision & Primary Goal
[Что library делает; главная проблема, которую решает.]
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
[MANDATORY per \`AX_SPEC_MANDATORY_DIAGRAM\` — ≥1 diagram up top (checked by \`SDD_NO_DIAGRAM_BLOCK\` / \`SDD_DIAGRAM_BLOCK_EMPTY\`). The floor is one — how a consumer wires this library in; add more by author judgment. Fenced mermaid OR ASCII; pick the diagram type per \`formats/diagram-vocabulary.xml\`. Example:]

\`\`\`mermaid
flowchart LR
  consumer -->|imports| library
  library --> capability
\`\`\`
<!--/SECTION:OVERVIEW-->

<!--SECTION:GOLDEN_DX-->
## Target Experience
[Публичный API DX: init/setup + happy path + error path. Комментарии раскрывают намерение.]
<!--/SECTION:GOLDEN_DX-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** [infra-*, interface scopes]
- **Provides to:** [consumer scopes]
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:REQUIREMENTS_AND_CONSTRAINTS-->
## Requirements & Constraints

### Functional Requirements

### Non-Functional Constraints

### Out-of-Scope

### Runtime & Deferred Scope
[Per \`AX_RUNTIME_BACKING_EXPLICIT\`. Backing per major capability + deferred parts.]

### Rules
| Rule | Category | Source |
|---|---|---|
<!--/SECTION:REQUIREMENTS_AND_CONSTRAINTS-->

<!--SECTION:PUBLIC_API_SURFACE-->
## Public API Surface
[Ключевые exported interfaces, types, functions. Intent-level, без impl detail.]
<!--/SECTION:PUBLIC_API_SURFACE-->

<!--SECTION:ARCHITECTURE-->
## Architecture
[Выбранный design pattern. Кратко — rejected alternatives.]
<!--/SECTION:ARCHITECTURE-->

<!--SECTION:DECISION_LOG-->
## Decision Log
[One-line human summary — how many decisions, what area. Full entries fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`) — history, never needed to grasp the scope NOW.]

<details>
<summary>Полные записи Decision Log</summary>

[D-NNN entries.]

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
[One-line human summary — is anything outstanding. Full table folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
<!-- Empty list allowed only when STEP_7 audit produced zero external assumptions — declare explicitly. -->

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff to Modules
- **Areas requiring decomposition:** [list]
- **Named abstractions:** [from Target Experience]
- **Bootstrap tickets ready for cascade:** see Prerequisites
- **Open risks:** [validation needs]

<!-- Pivot Invalidation List — only in pivot mode -->
<!--/SECTION:HANDOFF-->
`;

const LIBRARY_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'SCOPE_TYPE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Literal value `library`.',
  },
  {
    name: 'VISION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'What the library does and the main problem it solves.',
  },
  { name: 'OVERVIEW', required: true, loadBearing: false, fold: false, fill: OVERVIEW_FILL },
  {
    name: 'GOLDEN_DX',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Public API DX: init/setup + happy path + error path, intent commentary throughout.',
  },
  {
    name: 'SCOPE_DEPENDENCIES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'List infra-*/interface scopes depended on, and consumer scopes provided to.',
  },
  {
    name: 'REQUIREMENTS_AND_CONSTRAINTS',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Functional Requirements, Non-Functional Constraints, Out-of-Scope, Runtime & Deferred Scope, and the Rules table.',
  },
  {
    name: 'PUBLIC_API_SURFACE',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Key exported interfaces/types/functions, intent-level — no implementation detail.',
  },
  {
    name: 'ARCHITECTURE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Chosen design pattern, briefly, plus rejected alternatives.',
  },
  { name: 'DECISION_LOG', required: true, loadBearing: true, fold: true, fill: DECISION_LOG_FILL },
  {
    name: 'BOOTSTRAP_REQUIREMENTS',
    required: true,
    loadBearing: false,
    fold: true,
    fill: BOOTSTRAP_REQUIREMENTS_FILL,
  },
  {
    name: 'HANDOFF',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Areas requiring decomposition, named abstractions, bootstrap tickets, open risks.',
  },
];
// #endregion END_LIBRARY

// #region START_INFRASTRUCTURE — specs/<scope>/<scope>.spec.md, scope-type=infrastructure
const INFRASTRUCTURE_SKELETON = `# <scope-name>: Infrastructure Specification

<!--SECTION:SCOPE_TYPE-->
## scope-type
infrastructure
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision
[Что включает dev/ops experience.]
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
[MANDATORY per \`AX_SPEC_MANDATORY_DIAGRAM\` — ≥1 diagram up top (checked by \`SDD_NO_DIAGRAM_BLOCK\` / \`SDD_DIAGRAM_BLOCK_EMPTY\`). The floor is one — the developer workflow or the tool pipeline at a glance; add more by author judgment. Fenced mermaid OR ASCII; pick the diagram type per \`formats/diagram-vocabulary.xml\`. Example:]

\`\`\`
edit ──► typecheck ──► lint ──► test ──► pre-commit ──► CI
\`\`\`
<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** None (infrastructure scopes are typically leaves)
- **Provides rules to:** [list of product/library scopes that depend on this]
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:TOOL_STACK-->
## Tool Stack

### Categories Covered
[Список категорий + краткое обоснование исключений.]

### Tool Choices
| Category | Tool | Rationale |
|---|---|---|
| <category> | <tool> | D-NNN |
<!--/SECTION:TOOL_STACK-->

<!--SECTION:WORKFLOW_EXAMPLE-->
## Developer Workflow Example
[Shell-script: setup, daily flow, commit flow, debug flow.]
<!--/SECTION:WORKFLOW_EXAMPLE-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure
[ASCII tree + File Mapping.]
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:EFFECTIVE_RULES-->
## Effective Rules (for cascade)
[One-line human summary — how many rules, which categories. Full table folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Таблица правил</summary>

| Rule | Category | Source |
|---|---|---|
| <rule-name> | coding | infra (D-NNN) |

</details>
<!--/SECTION:EFFECTIVE_RULES-->

<!--SECTION:VERIFICATION_COMMANDS-->
## Verification Commands
**Mandatory for infrastructure scopes.** After tool stack is finalized, record a table:
| Command Name      | Invocation          |
| typecheck-command | <actual invocation> |
| test-command      | <actual invocation> |
| lint-command      | <actual invocation> |
| format-command    | <actual invocation> |
| check-command     | <actual invocation> |

Include only command names for tools present in the chosen stack.
\`check-command\` is **always required** when the runtime setup rule (\`nodejs-npm-setup\` or equivalent) is active — it is the composed entry point that runs all active phases in \`CheckPhaseOrder\` order (typecheck → test → lint → format). Composition: chain invocations of each active phase command in that order. Task tickets use \`check-command\` as their single verification alias.
<!--/SECTION:VERIFICATION_COMMANDS-->

<!--SECTION:DECISION_LOG-->
## Decision Log
[One-line human summary — how many decisions, what area. Full entries fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`) — history, never needed to grasp the scope NOW.]

<details>
<summary>Полные записи Decision Log</summary>

[D-NNN entries.]

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
[One-line human summary — is anything outstanding. Full table folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
<!-- Kind ∈ package | workspace-link | tool | file | external-type | env | service | structural -->
<!-- Owner ∈ this-scope-task | external-prereq-scope | operator-action -->
<!-- Empty list allowed only when STEP_7 audit produced zero external assumptions — declare it explicitly: "No external bootstrap required." -->

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff
- **Setup tasks to scaffold:** [list]
- **Effective rules ready for cascade:** see Effective Rules
- **Verification Commands ready for cascade:** see Verification Commands
- **Bootstrap tickets ready for cascade:** see Prerequisites
- **Open risks:** [not-closed items]

<!-- Pivot Invalidation List — only in pivot mode -->
<!--/SECTION:HANDOFF-->
`;

const INFRASTRUCTURE_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'SCOPE_TYPE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Literal value `infrastructure`.',
  },
  {
    name: 'VISION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'What dev/ops experience this scope covers.',
  },
  { name: 'OVERVIEW', required: true, loadBearing: false, fold: false, fill: OVERVIEW_FILL },
  {
    name: 'SCOPE_DEPENDENCIES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Depends-on (usually None — infra scopes are leaves) and the product/library scopes this provides rules to.',
  },
  {
    name: 'TOOL_STACK',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Categories covered plus rationale for exclusions, and the Category/Tool/Rationale (D-NNN) choices table.',
  },
  {
    name: 'WORKFLOW_EXAMPLE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Shell-script style walkthrough: setup, daily flow, commit flow, debug flow.',
  },
  {
    name: 'FILE_STRUCTURE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'ASCII tree plus File Mapping for the tooling config files.',
  },
  {
    name: 'EFFECTIVE_RULES',
    required: true,
    loadBearing: false,
    fold: true,
    fill: 'One-line summary of how many rules / which categories; full Rule/Category/Source table folds under <details>.',
  },
  {
    name: 'VERIFICATION_COMMANDS',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Mandatory: Command Name/Invocation table for the active phases (typecheck/test/lint/format) plus the composed check-command alias.',
  },
  { name: 'DECISION_LOG', required: true, loadBearing: true, fold: true, fill: DECISION_LOG_FILL },
  {
    name: 'BOOTSTRAP_REQUIREMENTS',
    required: true,
    loadBearing: false,
    fold: true,
    fill: BOOTSTRAP_REQUIREMENTS_FILL,
  },
  {
    name: 'HANDOFF',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Setup tasks to scaffold, effective rules/verification commands/bootstrap tickets ready for cascade, open risks.',
  },
];
// #endregion END_INFRASTRUCTURE

// #region START_INTERFACE — specs/<scope>/<scope>.spec.md, scope-type=interface
const INTERFACE_SKELETON = `# <scope-name>: Interface Specification

<!--SECTION:SCOPE_TYPE-->
## scope-type
interface
<!--/SECTION:SCOPE_TYPE-->

<!--SECTION:VISION-->
## Vision
[Что контракт определяет и для кого.]
<!--/SECTION:VISION-->

<!--SECTION:OVERVIEW-->
## Overview
[MANDATORY per \`AX_SPEC_MANDATORY_DIAGRAM\` — ≥1 diagram up top (checked by \`SDD_NO_DIAGRAM_BLOCK\` / \`SDD_DIAGRAM_BLOCK_EMPTY\`). The floor is one — who produces vs consumes this contract, or the version-transition flow; add more by author judgment. Fenced mermaid OR ASCII; pick the diagram type per \`formats/diagram-vocabulary.xml\`. Example:]

\`\`\`mermaid
flowchart LR
  producer -->|implements| Contract
  Contract -->|consumed by| consumer
\`\`\`
<!--/SECTION:OVERVIEW-->

<!--SECTION:SCOPE_DEPENDENCIES-->
## Scope Dependencies
- **Depends on:** [infra scopes if any]
- **Provides interface to:** [product/library scopes]
<!--/SECTION:SCOPE_DEPENDENCIES-->

<!--SECTION:INTERFACE_DECLARATION-->
## Interface Declaration
- **Schema format:** OpenAPI 3.x | gRPC proto3 | JSON Schema | GraphQL SDL
- **Versioning scheme:** semver | date-based (YYYY-MM-DD) | none
- **Namespace:** <api prefix / package name>
- **Interfaces:** [список endpoint groups / message types / operations]
<!--/SECTION:INTERFACE_DECLARATION-->

<!--SECTION:VERSIONING_POLICY-->
## Versioning Policy
[Semver rules / breaking-change protocol / deprecation window.]
<!--/SECTION:VERSIONING_POLICY-->

<!--SECTION:COMPATIBILITY_MATRIX-->
## Compatibility Matrix
[One-line human summary — how many consumers, any breaking changes pending. Full matrix folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Матрица совместимости</summary>

| Consumer scope | Min compatible version | Breaking change protocol |
|---|---|---|

</details>
<!--/SECTION:COMPATIBILITY_MATRIX-->

<!--SECTION:DECISION_LOG-->
## Decision Log
[One-line human summary — how many decisions, what area. Full entries fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`) — history, never needed to grasp the scope NOW.]

<details>
<summary>Полные записи Decision Log</summary>

[D-NNN entries.]

</details>
<!--/SECTION:DECISION_LOG-->

<!--SECTION:BOOTSTRAP_REQUIREMENTS-->
## Prerequisites
[One-line human summary — is anything outstanding. Full table folds (reference detail, checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Таблица предусловий</summary>

| Requirement | Kind | Owner | Resolution |
|---|---|---|---|
<!-- Empty list allowed only when STEP_7 audit produced zero external assumptions — declare explicitly. -->

</details>
<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->

<!--SECTION:HANDOFF-->
## Handoff
- **Contract files to scaffold:** [schema files, codegen configs]
- **Bootstrap tickets ready for cascade:** see Prerequisites
- **Open risks:** [versioning gaps, unconfirmed consumers]
<!--/SECTION:HANDOFF-->
`;

const INTERFACE_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'SCOPE_TYPE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Literal value `interface`.',
  },
  {
    name: 'VISION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'What the contract defines, and for whom.',
  },
  { name: 'OVERVIEW', required: true, loadBearing: false, fold: false, fill: OVERVIEW_FILL },
  {
    name: 'SCOPE_DEPENDENCIES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Infra scopes depended on (if any), and the product/library scopes this interface is provided to.',
  },
  {
    name: 'INTERFACE_DECLARATION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Schema format, versioning scheme, namespace, and the list of endpoint groups / message types / operations.',
  },
  {
    name: 'VERSIONING_POLICY',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'Semver rules, breaking-change protocol, deprecation window.',
  },
  {
    name: 'COMPATIBILITY_MATRIX',
    required: true,
    loadBearing: true,
    fold: true,
    fill: 'One-line summary of consumer count / pending breaking changes; full Consumer/Min-version/Breaking-change-protocol matrix folds under <details>.',
  },
  { name: 'DECISION_LOG', required: true, loadBearing: true, fold: true, fill: DECISION_LOG_FILL },
  {
    name: 'BOOTSTRAP_REQUIREMENTS',
    required: true,
    loadBearing: false,
    fold: true,
    fill: BOOTSTRAP_REQUIREMENTS_FILL,
  },
  {
    name: 'HANDOFF',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Contract files to scaffold (schemas, codegen configs), bootstrap tickets, open risks.',
  },
];
// #endregion END_INTERFACE

// #region START_MODULE — specs/<scope>/<module>/<module>.spec.md
const MODULE_SKELETON = `# Module: <ModuleName>

<!--SECTION:MODULE_VISION-->
## Module Vision
[What this module owns. Link to parent scope spec → \`../../<scope>.spec.md\`. Links to parent/child modules if any.]
<!--/SECTION:MODULE_VISION-->

<!--SECTION:OVERVIEW-->
## Overview
[MANDATORY per \`AX_SPEC_MANDATORY_DIAGRAM\` — ≥1 diagram, checked by \`SDD_NO_DIAGRAM_BLOCK\` / \`SDD_DIAGRAM_BLOCK_EMPTY\`. One glance beats a paragraph. The floor is one; add more (sequence, data-flow, state) whenever a second view genuinely helps a reader understand this module — that call is the author's. Fenced mermaid OR ASCII; pick the diagram type per \`formats/diagram-vocabulary.xml\`. The \`Inter-Module Dependencies\` graph is separate (machine-parsed) and does NOT satisfy this floor. Example — the module's main happy-path flow:]

\`\`\`mermaid
flowchart LR
  caller -->|request| Port
  Port --> Service
  Service -->|result| caller
\`\`\`
<!--/SECTION:OVERVIEW-->

<!--SECTION:MODULE_USAGE_EXAMPLE-->
## Module Usage Example
[MANDATORY. Self-sufficient happy-path snippet — как потребитель использует этот модуль в изоляции. Пишется на таргет-языке проекта — единственное место для кода per \`AX_CONTRACTS_TEXTUAL_AGNOSTIC\`. Показывает публичную поверхность через реальный сценарий вызова: init / happy path / минимальный error path. Composition с соседними модулями — НЕ здесь, это уровень scope spec (link, не дублировать).]
<!--/SECTION:MODULE_USAGE_EXAMPLE-->

<!--SECTION:INTER_MODULE_DEPENDENCIES-->
## Inter-Module Dependencies
- **Depends on:** <list of modules within this scope with links>
- **Scope Reference (cross-scope):** <interface-type scope with link if any>
- **Provides to:** <list of modules within this scope>

\`\`\`mermaid
graph TD
  <this-module> --> <sibling-1>
  <this-module> --> <sibling-2>
  <this-module> -. Scope Reference .-> <contracts-scope>
  <consumer> --> <this-module>
\`\`\`
<!--/SECTION:INTER_MODULE_DEPENDENCIES-->

<!--SECTION:ENTITY_INVENTORY-->
## Entity Inventory
[Per \`ENTITY_INVENTORY_FORMAT\`.]
<!--/SECTION:ENTITY_INVENTORY-->

<!--SECTION:ENTITY_SURFACES-->
## Entity Surfaces
[One-line human summary — what the surfaces cover; the reader sees this without expanding. Heavy per-entity detail folds per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`).]

<details>
<summary>Полные поверхности сущностей</summary>

[Each entity per \`ENTITY_SURFACE_FORMAT\`.]

</details>
<!--/SECTION:ENTITY_SURFACES-->

<!--SECTION:MODULE_CONTRACTS-->
## Module Contracts
[One-line human summary — which Ports / Adapters / Services this module defines. The contract bodies fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`).]

<!-- Subsections: any subset of Ports / Adapters / Services / Patterns / Utilities / Module-level invariants.
     Unnumbered \`###\` headers (e.g. \`### Ports\`, \`### OperationDef Pattern\`). -->

<details>
<summary>Контракты DbC</summary>

### Ports
[Per \`DBC_PORT_FORMAT\`. Omit if this module has no Ports.]

### Adapters
[Per \`DBC_ADAPTER_FORMAT\`. Omit if this module has no Adapters.]

</details>
<!--/SECTION:MODULE_CONTRACTS-->

<!--SECTION:PUBLIC_OPTIONS-->
## Public Options & Policies
[One-line human summary — what is configurable. Full enumeration folds (reference detail).]

<details>
<summary>Опции и политики</summary>

[All publicly observable flags/options/policies, either bound to contracts above OR explicitly \`deferred / not consumed in v1\` with link to ticket/version that activates them.]

</details>
<!--/SECTION:PUBLIC_OPTIONS-->

<!--SECTION:FILE_STRUCTURE-->
## File Structure
\`\`\`
<module>/
├── ports/
│   └── <name>-<port>.<ext>
├── adapters/
│   └── <platform>-<name>-<adapter>.<ext>
└── ...
\`\`\`

**File Mapping:**
- \`<path>\`: <component>
<!--/SECTION:FILE_STRUCTURE-->

<!--SECTION:MODULE_DECISION_LOG-->
## Module Decision Log
[One-line human summary — which decisions are recorded, at a glance. Full entries fold per \`AX_SPEC_PROGRESSIVE_DISCLOSURE\` (checked by \`SDD_SECTION_NOT_FOLDED\`) — a decision log only grows, it is never needed to grasp the module NOW.]

<details>
<summary>Полные записи Decision Log</summary>

[D-NNN entries at module level per \`DECISION_LOG_ENTRY_FORMAT\`. Cross-module or cross-scope → scope spec or contracts spec.]

</details>
<!--/SECTION:MODULE_DECISION_LOG-->

<!--SECTION:HANDOFF-->
## Handoff to Tasks
- **Implementation files to be created:** <list from File Structure>
- **Test files to be created:** <list>
- **Stack dependencies:**
  - Language: \`<lang>\` (resolves to \`ai/directives/coding/<lang>-rules.xml\`)
  - Test framework: \`<framework>\` (resolves to \`ai/directives/testing/<framework>.xml\`)
- **Module Rules Additions:** (additions on top of scope-wide baseline; \`None\` if no module-specific rules)

  | Rule | Category | Source |
  |------|----------|--------|
  | <rule-name> | coding \\| testing \\| architecture \\| quality | \`ai/directives/<category>/<rule>.xml\` |

- **Open risks & validation needs:** <not-closed items>
<!--/SECTION:HANDOFF-->

<!-- Optional appendix — include only when the module has non-trivial post-impl learnings worth preserving. -->
<!--SECTION:IMPLEMENTATION_INSIGHTS-->
## Implementation Insights
[One-line human summary — what a future reader must know. Detail folds (appendix).]

<details>
<summary>Заметки по реализации</summary>

[Library wrap patterns, transaction subtleties, fake-runtime pitfalls, etc. Authored after audit-cycle compaction; immutable contract for future readers.]

</details>
<!--/SECTION:IMPLEMENTATION_INSIGHTS-->
`;

const MODULE_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'MODULE_VISION',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'What this module owns; link to the parent scope spec and to sibling/parent/child modules.',
  },
  { name: 'OVERVIEW', required: true, loadBearing: false, fold: false, fill: OVERVIEW_FILL },
  {
    name: 'MODULE_USAGE_EXAMPLE',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'MANDATORY: self-sufficient happy-path snippet in the target language showing how a consumer uses this module in isolation (init/happy-path/minimal error path). No cross-module composition here.',
  },
  {
    name: 'INTER_MODULE_DEPENDENCIES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Depends-on / Scope Reference / Provides-to lists plus the machine-parsed dependency graph.',
  },
  {
    name: 'ENTITY_INVENTORY',
    required: true,
    loadBearing: true,
    fold: false,
    fill: 'The closed-world entity inventory per ENTITY_INVENTORY_FORMAT.',
  },
  {
    name: 'ENTITY_SURFACES',
    required: true,
    loadBearing: false,
    fold: true,
    fill: 'One-line summary of what the surfaces cover; per-entity detail per ENTITY_SURFACE_FORMAT folds under <details>.',
  },
  {
    name: 'MODULE_CONTRACTS',
    required: true,
    loadBearing: true,
    fold: true,
    fill: 'One-line summary of which Ports/Adapters/Services this module defines; the DbC contract bodies (Ports per DBC_PORT_FORMAT, Adapters per DBC_ADAPTER_FORMAT) fold under <details>.',
  },
  {
    name: 'PUBLIC_OPTIONS',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Publicly observable flags/options/policies, bound to a contract above or explicitly deferred with a link.',
  },
  {
    name: 'FILE_STRUCTURE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'ASCII tree of the module directory plus a File Mapping list.',
  },
  {
    name: 'MODULE_DECISION_LOG',
    required: false,
    loadBearing: false,
    fold: true,
    fill: 'One-line summary of recorded decisions; full D-NNN entries per DECISION_LOG_ENTRY_FORMAT fold under <details>.',
  },
  {
    name: 'HANDOFF',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Implementation/test files to create, stack dependencies (language/test framework), module rules additions, open risks.',
  },
  {
    name: 'IMPLEMENTATION_INSIGHTS',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Optional appendix — non-trivial post-implementation learnings (library wrap patterns, transaction subtleties, fake-runtime pitfalls), added after audit-cycle compaction.',
  },
];
// #endregion END_MODULE

// #region START_TASK — specs/<scope>/<module>/<module>.task.<ACR>-<slug>.md
const TASK_SKELETON = `# Task: <ACRONYM>-<slug> — <Task Title>

<!--SECTION:META-->
## Meta
- **Task-ID:** <ACRONYM>-<slug>   <!-- semantic slug; same slug across branches = same feature (see Slug Registry) -->
- **Status:** [ ] TODO   <!-- [ ] TODO | [~] IN_PROGRESS | [x] DONE | [!] BLOCKED -->
- **Purpose:** <semantic goal one-liner>
- **Scope:** <scope-name>
- **Module:** <module-name or N/A>
- **Dependencies:** <comma-separated Task-IDs or None>
- **Reopens:** <count> (<YYYY-MM-DD> — <last reason>)   <!-- omit when 0 -->
- **Spec References:**   <!-- one anchor PER contract — makes the contract set enumerable for the typing-scenario check -->
  - Contract: [<PortName>](<spec anchor>)
  - Adapter: [<AdapterName>](<spec anchor>)
  - Consumer: [<ConsumerName>](<spec anchor>)
  - Constraints (if applicable): [<scope spec §>](<path>)
- **Runtime Backing:** \`not-implemented\` | \`simulation\` | \`real-runtime\`
- **Verification Levels:** subset of \`contract\` | \`unit\` | \`integration\` | \`e2e\`
- **Deferred Runtime Scope:** None | <description>
<!--/SECTION:META-->

<!--SECTION:PHASES_OVERVIEW-->
## Phases Overview
| ID | Kind | Deps | Status |
|----|------|------|--------|
| P1 | <kind> | — | [ ] |
| P2 | <kind> | P1 | [ ] |

<!-- Kind ∈ bootstrap | impl | test | config | doc | refactor (fix only on execution). impl and test are ALWAYS separate phases. Orchestrator reads this table to plan. -->
<!--/SECTION:PHASES_OVERVIEW-->

## Phases

<!--SECTION:PHASE_P1-->
### P1 — <kind>
- **Objective:** <one-line>
- **Rules:**   <!-- links only, resolved from the cascade; rule content is never inlined -->
  - [ai/directives/<category>/<rule>.xml](<relative-path>)
- **Target Files:**
  - <path>
- **Inputs:** none   <!-- or "P1 handoff" -->
- **Exit:** <verifiable criterion>
<!--/SECTION:PHASE_P1-->

<!--SECTION:PHASE_P2-->
### P2 — <kind>
- **Objective:** <one-line>
- **Rules:**
  - [ai/directives/<category>/<rule>.xml](<relative-path>)
- **Target Files:**
  - <path>
- **Inputs:** P1 handoff
- **Exit:** <verifiable criterion>
<!--/SECTION:PHASE_P2-->

<!--SECTION:BDD-->
## Acceptance Criteria (BDD)
Each scenario is tagged with the requirement it proves and its verification level — this is the
use-case → \`[<ACRONYM>-REQ-N]\` → vision chain the operator reviews at scaffold.

**Feature:** <component behavior>

**Scenario:** <name> [\`<level>\`] \`[<ACRONYM>-REQ-N]\`
- **Given** <precondition>
- **When** <command / query>
- **Then** <postcondition>
- **And** <side effect>

<!-- BLOCKER: every DbC contract in Spec References has at least one \`contract\`-level typing scenario; Deferred Test Ownership is forbidden for typing scenarios. -->
<!--/SECTION:BDD-->

<!--SECTION:VERIFICATION-->
## Verification
| Command | Required by |
|---------|-------------|
| <resolved invocation> | <rule-id>, <rule-id> |

<!-- One row per unique check-command alias. Phase-subagent runs only rows whose Required-by overlaps its phase Rules. -->

- **Task-specific Completion additions:** <list or "none beyond project baseline">
<!--/SECTION:VERIFICATION-->

<!--SECTION:TEST_COVERAGE-->
## Test Scenario Coverage   <!-- BLOCKER: an unmapped scenario blocks task close -->
- Scenario <name> → \`<test-file>\` :: \`<canonical case name>\`   <!-- or: Deferred Test Ownership: <Task-ID> -->
<!--/SECTION:TEST_COVERAGE-->

<!--SECTION:EXECUTION_LOG-->
## Execution Log
*(Round = one execute-then-audit attempt; per-phase blocks within a Round. Skeleton is minimal — event lines appear only when the event happens. Token vocabulary lives in \`<module>.3-tasks.md\`. A \`[x]\` line with an unreplaced \`<…>\` placeholder is a fabricated DONE — forbidden.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] \`<ts>\` ver \`<cmd>\` → \`<pass|fail>\` exit=\`<code>\`
- [ ] \`<ts>\` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] \`<ts>\` DONE
<!--/SECTION:EXECUTION_LOG-->

<!--SECTION:DECISION_LOG-->
## Decision Log
<!-- local decisions taken during execution, ADR-compact (\`<ACRONYM>-D-N · <statement>\` → why ↳ rejected). Omit if none beyond the spec. -->
<!--/SECTION:DECISION_LOG-->

<!-- AUDIT_ROUNDS appended only after the first reopen-triggering audit (per the audit directive). -->
`;

const TASK_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'META',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Task-ID, Status, Purpose, Scope/Module, Dependencies, Spec References (one anchor per contract), Runtime Backing, Verification Levels, Deferred Runtime Scope.',
  },
  {
    name: 'PHASES_OVERVIEW',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'ID/Kind/Deps/Status table for every phase; impl and test are always separate phases.',
  },
  {
    name: 'PHASE_P<N>',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'One anchored PHASE_P<N> section per row in Phases Overview: Objective, Rules (links only), Target Files, Inputs, Exit criterion.',
  },
  {
    name: 'BDD',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Given/When/Then scenarios tagged with [<ACRONYM>-REQ-N] and a verification level. BLOCKER: every DbC contract in Spec References needs ≥1 contract-level typing scenario.',
  },
  {
    name: 'VERIFICATION',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Command/Required-by table — one row per unique check-command alias — plus task-specific completion additions.',
  },
  {
    name: 'TEST_COVERAGE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'BLOCKER: map every BDD scenario to a test-file + case name, or an explicit Deferred Test Ownership.',
  },
  {
    name: 'EXECUTION_LOG',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Round/phase event log — timestamps, verification runs, DONE lines, handoffs. Never fabricate a [x] with a placeholder still in it.',
  },
  {
    name: 'DECISION_LOG',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Local ADR-compact decisions taken during execution; omit if none beyond the spec.',
  },
];
// #endregion END_TASK

// #region START_MODULE_INDEX — specs/<scope>/<module...>/<module>.3-tasks.md (no SECTION anchors)
const MODULE_INDEX_SKELETON = `# <module> — Tasks

## Tracker Index
| Task-ID | Title | Dependencies | Status | Reopens |
|---------|-------|--------------|--------|---------|
| <ACRONYM>-<slug> | <title> | <deps or —> | [ ] TODO | — |

## Slug Registry
<!-- one slug per line; this IS the uniqueness mechanism — the same slug in two branches collides on merge here, surfacing "same feature" instead of hiding it. Append-only. -->
- <slug>

## Intra-Module DAG
\`\`\`mermaid
graph TD
  A[<slug-a>] --> B[<slug-b>]
\`\`\`
<!-- edge A → B = "A depends on B". Cross-module / cross-scope edges live one level up, not here. -->

## Decision Log (module-task level)
<!-- decomposition / planning decisions (ticket merges, deferred coverage, rule-activation overrides), ADR-compact. Local execution-time decisions stay in each ticket's own Decision Log. -->

## Conventions
Project-wide conventions (Execution-Log token vocabulary, Baseline Completion Rule, post-task audit hook, file-header) are declared once in \`specs/3-tasks.md\` and inherited here — not repeated.
`;

const MODULE_INDEX_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'TRACKER_INDEX',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Task-ID/Title/Dependencies/Status/Reopens table — one row per ticket in this module.',
  },
  {
    name: 'SLUG_REGISTRY',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Append-only list of every slug used in this module — the merge-collision uniqueness mechanism.',
  },
  {
    name: 'INTRA_MODULE_DAG',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Mermaid graph of intra-module ticket dependencies (edge A --> B = "A depends on B").',
  },
  {
    name: 'DECISION_LOG',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Decomposition/planning decisions (ticket merges, deferred coverage, rule-activation overrides), ADR-compact.',
  },
  {
    name: 'CONVENTIONS',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Pointer to specs/3-tasks.md — project-wide conventions are declared once there, inherited here.',
  },
];
// #endregion END_MODULE_INDEX

// #region START_SCOPE_INDEX — specs/<scope>/<scope>.3-tasks.md (no SECTION anchors)
const SCOPE_INDEX_SKELETON = `# Tasks: <scope>

## Scope Spec
- [Scope spec](./<scope>.spec.md)

## Cascade Table
Effective rules for this scope, from the Scope Graph (depends-on transitive closure). Tier order (low → high on collision): traversed-scopes → target-scope → module → phase.
| Tier | coding | testing | architecture | infra |
|------|--------|---------|--------------|-------|
| infra-base (traversed) | typescript-rules | vitest-rules | | eslint-setup |
| <scope> (target) | | | ports-adapters | |
| module:<m> | | node-test | | |

## Inter-Module DAG
\`\`\`mermaid
graph TD
  A[<module-a>] --> B[<module-b>]
\`\`\`

## Tracker
| Task-ID | Title | Module | Dependencies | Status | Reopens |
|---------|-------|--------|--------------|--------|---------|
| <ACR>-<slug> | <title> | <module> | <deps> | [ ] TODO | — |

## Decision Log (scope task level)
[D-NNN for scope-level decomposition / planning choices.]
`;

const SCOPE_INDEX_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'SCOPE_SPEC_LINK',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Link to the co-located scope spec (./<scope>.spec.md).',
  },
  {
    name: 'CASCADE_TABLE',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Effective rules for this scope from the Scope Graph depends-on transitive closure, by tier (traversed-scopes → target-scope → module → phase).',
  },
  {
    name: 'INTER_MODULE_DAG',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Mermaid graph of inter-module dependencies within this scope.',
  },
  {
    name: 'TRACKER',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Task-ID/Title/Module/Dependencies/Status/Reopens rollup table — module tickets plus any scope-level tickets (infra/interface scopes with no modules).',
  },
  {
    name: 'DECISION_LOG',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Scope-level decomposition/planning decisions, D-NNN, ADR-compact.',
  },
];
// #endregion END_SCOPE_INDEX

// #region START_PROJECT_INDEX — specs/3-tasks.md (no SECTION anchors)
// Skeleton copied 1:1 from the canonical contract's fenced body (ai/kit/contract/scaffold/project-tasks-index.xml,
// reconciled with ai/directives/sdd-v2/formats/project-tasks-index.xml — both identical at time of writing).
const PROJECT_INDEX_SKELETON = `# Project Tasks

## Entry Points
- [Specs Portal](./README.md) — Scope Graph + all scope specs.
- Tickets execute ONLY via the \`/sdd-execute\` flow (one ticket) or its batch form; the orchestrator dispatches phase-workers then audit — the operator does not invoke audit by hand.

## Project-Wide Conventions (declared once, inherited)
- **File-header:** owned by the coding rule (\`@file\` / \`@consumers\` / \`@tasks\`), enforced by \`sdd-verify\`.
- **Baseline Completion Rule:** a Round cannot go \`[x] DONE\` until — every phase \`[x]\`; every BDD scenario mapped to a test or \`Deferred Test Ownership\`; verification commands run with exit recorded; every entity beyond the Inventory logged \`intro …\`; a Handoff line closes each phase.
- **Execution-Log token vocabulary:** \`intro <Entity> ← <reason>\` · \`decision <key>=<value> ← <reason>\` · \`tried <approach> → <result>\` · \`discovery <fact>\` · \`insight <observation> → <spec-section>\` · \`verified <tool>@<version> <summary>\` · \`ver <cmd> → pass|fail exit=<N>\` · \`BLOCKED <cause>\` · \`DONE\`. A \`[x]\` line with an unreplaced \`<…>\` placeholder is fabricated (BLOCKER).
- **Post-task hook:** after a Round closes the orchestrator runs audit; until PASS the round is closed-but-unverified and dependents are blocked.

## Cross-Scope DAG
Cross-scope edges + integration tickets only; intra-scope edges live in each scope index. Order follows the Portal Scope Graph.
\`\`\`mermaid
graph TD
  backend --> infra-base
  web --> backend
\`\`\`

## Scope Tracker
| Scope | Type | Index | Tasks | Done |
|---|---|---|---|---|
| infra-base | infrastructure | [3-tasks](./infra-base/infra-base.3-tasks.md) | 6 | 0/6 |
| backend | product | [3-tasks](./backend/backend.3-tasks.md) | 12 | 0/12 |

## Decision Log (project task level)
[D-NNN when the operator made non-default cross-scope choices.]
`;

const PROJECT_INDEX_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'ENTRY_POINTS',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Link to the Specs Portal, plus the reminder that tickets execute only via /sdd-execute (single or batch).',
  },
  {
    name: 'PROJECT_WIDE_CONVENTIONS',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'File-header rule, Baseline Completion Rule, Execution-Log token vocabulary, and post-task audit hook — declared once here, inherited by every scope/module/ticket.',
  },
  {
    name: 'CROSS_SCOPE_DAG',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Mermaid graph of cross-scope depends-on edges + integration tickets only; intra-scope edges live in each scope index.',
  },
  {
    name: 'SCOPE_TRACKER',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Scope/Type/Index/Tasks/Done rollup table — one row per scope, linking to its 3-tasks.md.',
  },
  {
    name: 'DECISION_LOG',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'Cross-scope decomposition/planning decisions, D-NNN, ADR-compact.',
  },
];
// #endregion END_PROJECT_INDEX

// #region START_PORTAL — specs/README.md (no SECTION anchors)
const PORTAL_SKELETON = `# <project-name>

## Vision
<Одно предложение. Опускается для infrastructure-only проектов.>

## Scope Graph

\`\`\`mermaid
graph TD
  backend --> infra-base
  backend --> api
  web --> infra-base
  web --> api
  web --> design-system-core
  mobile --> api
\`\`\`

## Scopes

| Scope | Type | Spec | Description |
|---|---|---|---|
| [\`infra-base\`](./infra-base/infra-base.spec.md) | infrastructure | ✅ | TS + pnpm + vitest + biome |
| [\`api\`](./api/api.spec.md) | interface | 🚧 | REST API v1 |
| [\`backend\`](./backend/backend.spec.md) | product | ✅ | Node.js IMAP-сервис |
| [\`web\`](./web/web.spec.md) | product | 🚧 | React SPA |
`;

const PORTAL_SECTIONS: SectionManifestEntry[] = [
  {
    name: 'VISION',
    required: false,
    loadBearing: false,
    fold: false,
    fill: 'One sentence for the whole project; omit for infrastructure-only projects.',
  },
  {
    name: 'SCOPE_GRAPH',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'A mermaid graph of scope depends-on edges.',
  },
  {
    name: 'SCOPES',
    required: true,
    loadBearing: false,
    fold: false,
    fill: 'Scope/Type/Spec-status/Description table — one row per scope, linking to its spec.md.',
  },
];
// #endregion END_PORTAL

/**
 * @purpose The registry: one ArtifactTemplate per kind — single source of truth backing check.ts
 * (derived required/fold lists) and `gennady sdd-new`.
 */
export const TEMPLATES: Record<ArtifactKind, ArtifactTemplate> = {
  product: {
    kind: 'product',
    skeleton: PRODUCT_SKELETON,
    sections: PRODUCT_SECTIONS,
    pathPattern: 'specs/<scope>/<scope>.spec.md',
  },
  library: {
    kind: 'library',
    skeleton: LIBRARY_SKELETON,
    sections: LIBRARY_SECTIONS,
    pathPattern: 'specs/<scope>/<scope>.spec.md',
  },
  infrastructure: {
    kind: 'infrastructure',
    skeleton: INFRASTRUCTURE_SKELETON,
    sections: INFRASTRUCTURE_SECTIONS,
    pathPattern: 'specs/<scope>/<scope>.spec.md',
  },
  interface: {
    kind: 'interface',
    skeleton: INTERFACE_SKELETON,
    sections: INTERFACE_SECTIONS,
    pathPattern: 'specs/<scope>/<scope>.spec.md',
  },
  module: {
    kind: 'module',
    skeleton: MODULE_SKELETON,
    sections: MODULE_SECTIONS,
    pathPattern: 'specs/<scope>/<module>/<module>.spec.md',
  },
  task: {
    kind: 'task',
    skeleton: TASK_SKELETON,
    sections: TASK_SECTIONS,
    pathPattern: 'specs/<scope>/<module>/<module>.task.<ACR>-<slug>.md',
  },
  'module-index': {
    kind: 'module-index',
    skeleton: MODULE_INDEX_SKELETON,
    sections: MODULE_INDEX_SECTIONS,
    pathPattern: 'specs/<scope>/<module...>/<module>.3-tasks.md',
  },
  'scope-index': {
    kind: 'scope-index',
    skeleton: SCOPE_INDEX_SKELETON,
    sections: SCOPE_INDEX_SECTIONS,
    pathPattern: 'specs/<scope>/<scope>.3-tasks.md',
  },
  'project-index': {
    kind: 'project-index',
    skeleton: PROJECT_INDEX_SKELETON,
    sections: PROJECT_INDEX_SECTIONS,
    pathPattern: 'specs/3-tasks.md',
  },
  portal: {
    kind: 'portal',
    skeleton: PORTAL_SKELETON,
    sections: PORTAL_SECTIONS,
    pathPattern: 'specs/README.md',
  },
};

/**
 * @purpose All artifact kinds, in registry declaration order.
 */
export const ARTIFACT_KINDS = Object.keys(TEMPLATES) as ArtifactKind[];

/**
 * @purpose Section names a mechanical gate must treat as load-bearing (required) for this kind — the
 * exact membership `check.ts`'s `REQUIRED_SECTIONS` / `MODULE_REQUIRED_V2` enforce today.
 * @param kind Artifact kind.
 * @returns Section names, in manifest order.
 */
export function loadBearingSections(kind: ArtifactKind): string[] {
  return TEMPLATES[kind].sections.filter((s) => s.loadBearing).map((s) => s.name);
}

/**
 * @purpose Section names this kind requires to fold their body under `<details>` — the exact membership
 * of `check.ts`'s per-kind fold gate.
 * @param kind Artifact kind.
 * @returns Section names, in manifest order.
 */
export function foldSections(kind: ArtifactKind): string[] {
  return TEMPLATES[kind].sections.filter((s) => s.fold).map((s) => s.name);
}
