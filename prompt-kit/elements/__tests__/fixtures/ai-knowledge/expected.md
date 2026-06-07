KEYWORDS:
knowledge

<!--START_AI_KNOWLEDGE-->
# AiKnowledge:

<!--START_DIRECTIVES-->
## Directives:

<!--START_SDD-->
### Sdd:

<!--START_SDD_SETUP-->
#### SddSetup:

- **File:** ai/directives/sdd/setup.directive.xml

- **Purpose:** Creates or updates specs/README.md — Vision and Scope Graph. Sole owner of the Portal. Idempotent.

- **Triggers:** new project · add scope · change project vision · register scope after discovery

- **SkipWhen:** designing a specific scope · module decomposition · task scaffolding

- **Preconditions:** None
<!--END_SDD_SETUP-->

<!--START_SDD_DISCOVERY-->
#### SddDiscovery:

- **File:** ai/directives/sdd/discovery.directive.xml

- **Purpose:** Scope-level discovery session. Creates or evolves specs/[scope]/[scope].spec.md. Branches by scope-type: infrastructure, contracts, library, product.

- **Triggers:** design scope · raw idea for service/SDK/CLI/app · bootstrap infra tooling · refine or pivot existing scope

- **SkipWhen:** approved spec exists and operator wants module decomposition · bug fix or local refactor · project-level vision change

- **Preconditions:** greenfield: none. refine/pivot: specs/[scope]/[scope].spec.md exists
<!--END_SDD_DISCOVERY-->

<!--START_SDD_MODULE_DECOMPOSITION-->
#### SddModuleDecomposition:

- **File:** ai/directives/sdd/module-decomposition.directive.xml

- **Purpose:** Decomposes a product or library scope into module specs with closed-world entity inventory, public surfaces, DbC contracts (Ports / Adapters / Services).

- **Triggers:** discovery complete · split into modules · build module map · list all entities · produce DbC · Ports and Adapters

- **SkipWhen:** scope spec missing or not approved · discovery still open · scope-type is infrastructure or contracts · tasks already generated

- **Preconditions:** specs/[scope]/[scope].spec.md with scope-type=product or library
<!--END_SDD_MODULE_DECOMPOSITION-->

<!--START_SDD_TASK_SCAFFOLDING-->
#### SddTaskScaffolding:

- **File:** ai/directives/sdd/scaffold.directive.xml

- **Purpose:** Builds DAG of compact task tickets from scope graph. Each ticket includes BDD, Effective Rules, Verification, Execution Log template.

- **Triggers:** all scope specs ready · break into tasks · build DAG · produce execution plan · scaffold tickets

- **SkipWhen:** module specs lack contracts · discovery or module-decomp not closed · tasks already generated

- **Preconditions:** specs/README.md Scope Graph ✅; coding rule files exist for each language
<!--END_SDD_TASK_SCAFFOLDING-->

<!--START_SDD_PHASE_EXECUTION-->
#### SddPhaseExecution:

- **File:** ai/directives/sdd/phase-execution-protocol.xml

- **Purpose:** Execute ONE phase of ONE task ticket, dispatched by sdd-execute orchestrator. Read only what the phase needs; write only Target Files; emit typed Handoff for next phase / audit.

- **Triggers:** orchestrator dispatches phase · phase ID + ticket path provided in prompt

- **SkipWhen:** operator invokes directly without orchestrator · no phase ID

- **Preconditions:** ticket has section 2 Phases Overview + section 3 Phases block for target phase ID; prior-phase Handoffs (if any) recorded in current Round
<!--END_SDD_PHASE_EXECUTION-->

<!--START_SDD_AUDIT-->
#### SddAudit:

- **File:** ai/directives/sdd/audit.directive.xml

- **Purpose:** Post-execution verification. Compares spec ↔ ticket ↔ code. Detects drift, gaps, rules violations. Output: ephemeral findings routed to spec/ticket.

- **Triggers:** audit · drift detection · post-implementation review · verify implementation · end of epic before merge

- **SkipWhen:** no executed tasks · Execution Log empty · no spec to compare

- **Preconditions:** spec exists; ticket with non-empty Execution Log; code committed
<!--END_SDD_AUDIT-->
<!--END_SDD-->
<!--END_DIRECTIVES-->

<!--START_RULES-->
## Rules:

- **CheckPhaseOrder:** typecheck test lint format

<!--START_CODING-->
### Coding:

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/coding/result-conventions.xml

- **Purpose:** ESLint enforcement of Result pattern conventions: no second generic, no object literals, no isErr short-circuit, no bare throw unknown.

- **Triggers:** Target Files use Result from @tessell/core/result · task touches error-handling code · task adds new DML / service methods

- **SkipWhen:** Config-only task; no Result usage in target files

- **ActivationHint:** Before writing or reviewing any file that returns or propagates Result

- **CheckPhase:** lint

- **RequiresVerification:** check-command
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/coding/typescript-rules.xml

- **Purpose:** Writing code in the chosen language: typing, DbC, patterns, anti-patterns.

- **Triggers:** Target Files include source code files (not config)

- **SkipWhen:** Config-only task; infra-setup task without code files

- **ActivationHint:** Before editing or creating any source code file

- **CheckPhase:** typecheck

- **RequiresVerification:** check-command
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/coding/svelte5-runes.xml

- **Purpose:** Writing Svelte 5 components with runes ($state, $derived, $effect, $props, $bindable). Inherits typescript-rules; adds Svelte-specific reactivity, template syntax, component structure. Prevents React-pattern code in .svelte files.

- **Triggers:** creating .svelte file · writing Svelte component · using runes · .svelte.ts module

- **SkipWhen:** pure TypeScript without Svelte · React/Vue project · backend server code

- **ActivationHint:** Before editing or creating any .svelte, .svelte.ts, or .svelte.js file. Inherits from typescript-rules — read both.

- **CheckPhase:** typecheck

- **RequiresVerification:** check-command

- **CrossRef:** Parent directive: inherits all TypeScript rules for language baseline.

- **CrossRef:** SvelteKit projects also activate sveltekit-rules (inherits from this directive).
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/coding/sveltekit-rules.xml

- **Purpose:** Writing SvelteKit applications: file-based routing (+page, +layout, +server), server load functions, form actions, hooks, adapters, $app modules. Inherits svelte5-runes + typescript-rules transitively.

- **Triggers:** creating SvelteKit route · load function · form actions · hooks.server.ts · server/client boundary

- **SkipWhen:** standalone Svelte without SvelteKit · pure component library · non-SvelteKit project

- **ActivationHint:** Before writing SvelteKit route files or server logic. Inherits from svelte5-runes — read both.

- **CheckPhase:** typecheck

- **RequiresVerification:** check-command

- **CrossRef:** Parent directive: inherits all Svelte 5 runes rules.

- **CrossRef:** Transitive parent: inherits TypeScript rules through svelte5-runes.
<!--END_RULE-->
<!--END_CODING-->

<!--START_TESTING-->
### Testing:

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/common.xml

- **Purpose:** Shared testing core inherited by every runner-specific directive: contract boundary, case flow, phase anchors, unified context + factory, BDD mapping, snapshot operator-confirm, file budget.

- **Triggers:** any runner-specific testing rule activates

- **SkipWhen:** no test files in scope

- **ActivationHint:** Auto-read whenever node-test or vitest-rules activates. Runner-specific files only state deltas.

- **CheckPhase:** test

- **RequiresVerification:** check-command
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/vitest-rules.xml

- **Purpose:** Writing tests on Vitest runner.

- **Triggers:** Target Test Files present AND stack uses Vitest

- **SkipWhen:** Stack uses a different test runner; no test files in scope

- **ActivationHint:** Before writing or modifying test files. Inherits testing-common.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** Parent directive: read first for case flow, anchors, unified context, BDD mapping.
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/node-test.xml

- **Purpose:** Writing tests on node:test runner.

- **Triggers:** Target Test Files present AND stack uses node:test

- **SkipWhen:** Stack uses a different test runner; no test files in scope

- **ActivationHint:** Before writing or modifying test files. Inherits testing-common.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** Parent directive: read first for case flow, anchors, unified context, BDD mapping.
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/playwright-cli.xml

- **Purpose:** Exploring web apps through Playwright CLI: AX Tree vision, aria snapshots, screenshots, trace viewer, codegen. Gives the agent eyes and hands for browser exploration.

- **Triggers:** developing UI component · building a page · verifying visual layout · debugging failing e2e test · capturing aria snapshots

- **SkipWhen:** pure backend logic · CLI command implementation · API endpoint without UI

- **ActivationHint:** BEFORE writing any e2e test — explore the page first. Also when an e2e test fails and the agent needs to see what rendered.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** Transition to playwright-e2e when exploration complete.
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/playwright-e2e.xml

- **Purpose:** Writing Playwright E2E tests: aria-snapshot-first contracts, role-based locators, fixture-based POM, auth via storageState, network mocking.

- **Triggers:** writing e2e test · creating browser test · adding Playwright spec · testing user flow

- **SkipWhen:** unit test · integration test without browser · exploration not done (use playwright-cli first)

- **ActivationHint:** AFTER playwright-cli exploration. Before writing Playwright spec files.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** MUST run playwright-cli exploration first.
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/storybook-usage.xml

- **Purpose:** Using Storybook MCP tools: reading manifests (component docs, props, stories), writing stories, running tests, self-verifying component rendering.

- **Triggers:** developing UI component · using design system · creating story · fixing component bug · verifying component renders

- **SkipWhen:** pure backend/CLI logic · no Storybook · MCP not installed (use storybook-setup first)

- **ActivationHint:** Whenever working with UI components — BEFORE writing code, call MCP tools to check documented props.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** MUST have Storybook + MCP running. If unreachable, invoke storybook-setup.
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/testing/svelte-testing.xml

- **Purpose:** Testing Svelte 5 components: .svelte.test.ts extension, $effect.root isolation, flushSync for DOM, mount/unmount, @testing-library/svelte. Inherits node-test + vitest-rules.

- **Triggers:** writing Svelte component test · testing runes · mounting Svelte component · Storybook interaction test for Svelte

- **SkipWhen:** pure TS logic test without runes · E2E test with Playwright · non-Svelte project

- **ActivationHint:** Before writing .svelte.test.ts. Inherits from node-test.xml and vitest-rules.xml.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** Inherits general testing rules (phase anchors, learning briefs, contract coverage).

- **CrossRef:** Inherits Vitest-specific rules (unified context, mock discipline).

- **CrossRef:** Runes knowledge required (.svelte.test.ts, $effect.root, flushSync).
<!--END_RULE-->
<!--END_TESTING-->

<!--START_INFRA-->
### Infra:

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/infra/eslint-setup.xml

- **Purpose:** Configuring a linter: severity policy, autofix, config format, formatter integration.

- **Triggers:** Task configures linter · installs linter · sets lint rules

- **SkipWhen:** Coding/testing task that only RUNS lint, does not configure it

- **ActivationHint:** Before writing linter config or modifying lint rules

- **CheckPhase:** lint

- **RequiresVerification:** check-command
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/infra/git-setup.xml

- **Purpose:** Configuring VCS: ignore baseline, branches, commits, hooks, secrets discipline.

- **Triggers:** Task bootstraps repo · configures VCS ignore file · sets up hooks · commit convention

- **SkipWhen:** Task only commits code changes (does not configure VCS itself)

- **ActivationHint:** Before writing VCS ignore file or configuring hooks
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/infra/nodejs-npm-setup.xml

- **Purpose:** Runtime + package manager setup: version pinning, single package manager, module system, mandatory check script.

- **Triggers:** Task writes package manager manifest · runtime version file · sets engines · chooses package manager

- **SkipWhen:** Task does not touch package manager manifest or runtime config

- **ActivationHint:** Before writing package manager manifest or runtime version file
<!--END_RULE-->

<!--START_RULE-->
#### Rule:

- **File:** ai/directives/infra/storybook-setup.xml

- **Purpose:** Installing Storybook + MCP server: agentic init, MCP addon, Vitest addon, agent registration, AGENTS.md update. Bootstraps component development environment.

- **Triggers:** install Storybook · add Storybook to project · configure MCP server · bootstrap UI toolchain

- **SkipWhen:** no UI components · Storybook already installed + MCP confirmed running

- **ActivationHint:** When project needs Storybook for first time. Follow agentic init: npx storybook@latest init.

- **CheckPhase:** test

- **RequiresVerification:** check-command

- **CrossRef:** After setup (MCP running, manifest accessible), transition to storybook-usage.
<!--END_RULE-->
<!--END_INFRA-->
<!--END_RULES-->
<!--END_AI_KNOWLEDGE-->