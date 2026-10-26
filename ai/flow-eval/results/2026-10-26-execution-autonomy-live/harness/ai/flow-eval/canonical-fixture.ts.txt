// @file: Shared canonical fixture artifacts; one template-backed authoring path for execute controls.
// @spec: AI-SKILLS
// @consumers: provision, execution-autonomy fixtures

import { TEMPLATES } from '../../shared/sdd/templates.ts';

/** @purpose Replace one canonical template section while preserving its paired anchors. | @param document Template text. | @param name Exact section handle. | @param body Replacement contents. | @returns Text with paired section anchors retained. */
export function replaceSection(document: string, name: string, body: string): string {
  const pattern = new RegExp(`<!--SECTION:${name}-->[\\s\\S]*?<!--/SECTION:${name}-->`, 'm');
  return document.replace(
    pattern,
    `<!--SECTION:${name}-->\n${body.trim()}\n<!--/SECTION:${name}-->`
  );
}

/** @purpose Render a filled scope template with the V2 structural contract, not a hand-written heading. | @param scope Scope slug. | @param acronym Requirement namespace. | @param module Owned module slug. | @param [operation] Public operation name. | @returns Canonical scope artifact. */
export function canonicalScope(
  scope: string,
  acronym: string,
  module: string,
  operation = 'applyMove'
): string {
  const slugify = operation === 'slugify';
  let document = TEMPLATES.product.skeleton
    .replaceAll('<scope-name>', scope)
    .replaceAll('<SPEC-ID>', acronym)
    .replaceAll('<ACR>', acronym)
    .replaceAll('<module>', module)
    .replaceAll('<ModuleName>', module);
  document = replaceSection(
    document,
    'VISION',
    `## Vision & Primary Goal\n${scope} provides deterministic ${slugify ? 'URL slug normalization' : 'game rules'}.`
  );
  document = replaceSection(
    document,
    'OVERVIEW',
    `## Overview\n\n\`\`\`mermaid\nflowchart TD\n  caller --> rules\n  rules --> result\n\`\`\`\n_${slugify ? 'Slug normalization' : 'Game rules'} is isolated behind one deterministic capability._`
  );
  document = replaceSection(
    document,
    'PROJECT_TYPE',
    '## Project Type\n- **Type:** service-module-sdk\n- **Why this type:** deterministic library API.'
  );
  document = replaceSection(
    document,
    'GOLDEN_DX',
    '## Target Experience\nA caller submits an input and receives a deterministic normalized result; invalid input returns a typed error.'
  );
  document = replaceSection(
    document,
    'SCOPE_DEPENDENCIES',
    '## Scope Dependencies\n- **Depends on:** none\n- **Provides to:** fixture consumer'
  );
  document = replaceSection(
    document,
    'REQUIREMENTS_AND_CONSTRAINTS',
    slugify
      ? `## Requirements & Constraints\n\n### Requirements\n\n### ${acronym}-REQ-1 [должен]\n**Когда** a caller submits text, **the library must** return a lowercase hyphen-separated slug.\n\n### ${acronym}-REQ-2 [должен · нештатная]\n**Если** runtime input is not text, **то библиотека должна** reject it with a validation error.\n\n### Out-of-Scope\nTransliteration dictionaries are out of scope.\n\n### Runtime & Deferred Scope\nNo deferred runtime scope.\n\n### Rules\n| Rule | Category | Source |\n|---|---|---|\n| node-test | testing | ai/directives/testing/node-test.xml |`
      : `## Requirements & Constraints\n\n### Requirements\n\n### ${acronym}-REQ-1 [должен]\n**Когда** a caller submits a legal move, **the library must** return the next board.\n\n### ${acronym}-REQ-2 [должен · нештатная]\n**Если** a move is illegal, **то библиотека должна** reject it without mutating the board.\n\n### Out-of-Scope\nNetwork persistence is out of scope.\n\n### Runtime & Deferred Scope\nNo deferred runtime scope.\n\n### Rules\n| Rule | Category | Source |\n|---|---|---|\n| node-test | testing | ai/directives/testing/node-test.xml |`
  );
  document = replaceSection(
    document,
    'USE_CASES',
    '## Use Cases\n\n```mermaid\nflowchart TD\n  caller --> input\n  input --> result\n```\n_Normal and invalid inputs are observable._'
  );
  document = replaceSection(
    document,
    'DATA_FLOW',
    '## Data Flow\n\n```mermaid\nflowchart LR\n  caller(caller) -->|input| rules[Rules]\n  rules -->|normalized result| caller\n```\n_Input is validated before the result is returned._'
  );
  document = replaceSection(
    document,
    'ARCHITECTURE',
    slugify
      ? '## High-Level Architecture\nA pure rules module owns input validation and deterministic slug normalization.\n\n### Rejected Alternatives\nLocale-dependent transliteration was rejected.'
      : '## High-Level Architecture\nA pure rules module owns validation and winner detection.\n\n### Rejected Alternatives\nA mutable global board was rejected.'
  );
  document = replaceSection(
    document,
    'MODULE_MAP',
    `## Module Map\n- [${module}](./${module}/${module}.spec.md)`
  );
  document = replaceSection(
    document,
    'DECISION_LOG',
    `## Decision Log\n\n<details>\n<summary>Approval records</summary>\n\n### Approval #1 — current specification set\n- **Status:** approved\n- **Reviewed set:** \`specs/${scope}/${scope}.spec.md\`, \`specs/${scope}/${module}/${module}.spec.md\`\n- **Independent review:** clean\n- **Operator decision:** approved\n- **Recorded:** 2026-09-02\n\n</details>`
  );
  document = replaceSection(document, 'RESEARCH', '## Research\n\nNo research documents.');
  document = replaceSection(
    document,
    'BOOTSTRAP_REQUIREMENTS',
    slugify
      ? '<details>\n<summary>Prerequisites</summary>\n\nNo external bootstrap required; the canonical execute fixture is already provisioned.\n\n</details>'
      : '<details>\n<summary>Prerequisites</summary>\n\n| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |\n|---|---|---|---|---|---|\n| Repository runtime, package manager, and configuration | file | this-scope-task | verify pre-provisioned fixture toolchain | — | package.json, tsconfig.json |\n\n</details>'
  );
  document = replaceSection(
    document,
    'HANDOFF',
    `## Handoff to Modules\n- **Primary input:** specs/${scope}/${scope}.spec.md\n- **Areas requiring decomposition:** ${module}\n- **Named abstractions:** ${operation}\n- **Bootstrap tickets ready for cascade:** none\n- **Open risks:** none`
  );
  return document;
}

/** @purpose Render a canonical module artifact from the shared V2 template registry. | @param scope Owner scope slug. | @param acronym Requirement namespace. | @param module Module slug. | @param [operation] Public operation name. | @param [sourceFile] Implementation target. | @returns Canonical module artifact. */
export function canonicalModule(
  scope: string,
  acronym: string,
  module: string,
  operation = 'applyMove',
  sourceFile = 'src/game.ts'
): string {
  const requirements =
    operation === 'slugify'
      ? `## Requirements\n\n### ${acronym}-REQ-1 [должен]\n**Когда** input is valid text, **the module must** return lowercase hyphen-separated words.\n\n### ${acronym}-REQ-2 [должен]\n**Когда** input contains repeated separators, **the module must** collapse them without mutating the input.\n\n### ${acronym}-REQ-3 [должен · нештатная]\n**Если** runtime input is not a string, **то модуль должен** reject it with a validation error.`
      : `## Requirements\n\n### ${acronym}-REQ-1 [должен]\n**Когда** a move is legal, **the module must** return a new board.\n\n### ${acronym}-REQ-2 [должен · нештатная]\n**Если** a move is illegal, **то модуль должен** return a validation error without mutating the board.`;
  let document = TEMPLATES.module.skeleton
    .replaceAll('<ModuleName>', module)
    .replaceAll('<scope-name>', scope)
    .replaceAll('<module>', module)
    .replaceAll('<SPEC-ID>', acronym)
    .replaceAll('<ACR>', acronym);
  document = replaceSection(
    document,
    'MODULE_VISION',
    `## Module Vision\n${module} owns deterministic rules for ${scope}. Link: ../${scope}.spec.md`
  );
  document = replaceSection(
    document,
    'OVERVIEW',
    '## Overview\n\n```mermaid\nflowchart LR\n  caller --> Rules\n  Rules --> caller\n```\n_Rules are pure and deterministic._'
  );
  document = replaceSection(
    document,
    'MODULE_USAGE_EXAMPLE',
    `## Module Usage Example\n\`${operation}(input)\` returns a deterministic result.`
  );
  document = replaceSection(document, 'MODULE_REQUIREMENTS', requirements);
  document = replaceSection(
    document,
    'INTER_MODULE_DEPENDENCIES',
    '## Inter-Module Dependencies\n- **Depends on:** none\n- **Scope Reference (cross-scope):** none\n- **Provides to:** fixture consumer'
  );
  document = replaceSection(
    document,
    'ENTITY_INVENTORY',
    `| Name | Type | Purpose |\n|---|---|---|\n| ${operation} | Function | Validate and normalize one input. |`
  );
  document = replaceSection(
    document,
    'ENTITY_SURFACES',
    `<details>\n<summary>Entity surfaces</summary>\n\n\`${operation}(input)\` returns a normalized result or validation error.\n\n</details>`
  );
  document = replaceSection(
    document,
    'MODULE_CONTRACTS',
    `## Module Contracts\n\n<details>\n<summary>Contracts</summary>\n\n### Services\n- \`${operation}\`: does not mutate input and handles invalid or boundary input.\n\n</details>`
  );
  document = replaceSection(
    document,
    'PUBLIC_OPTIONS',
    `## Public Options & Policies\nBehavior is fixed by the approved contract; the fixture exposes no runtime options.\n\n<details>\n<summary>Options and policies</summary>\n\n- No configurable options.\n\n</details>`
  );
  document = replaceSection(
    document,
    'FILE_STRUCTURE',
    `## File Structure\n\`\`\`text\n${module}/${module}.spec.md\n${sourceFile}\n\`\`\`\n\n**File Mapping:**\n- \`${sourceFile}\`: rule implementation`
  );
  document = replaceSection(
    document,
    'HANDOFF',
    `## Handoff to Tasks\n- **Implementation files to be created:** ${sourceFile}\n- **Test files to be created:** ${sourceFile.replace(/\.ts$/, '.test.ts')}\n- **Stack dependencies:**\n  - Language: \`typescript\`\n  - Test framework: \`node-test\`\n- **Module Rules Additions:** None\n- **Open risks & validation needs:** none`
  );
  document = replaceSection(
    document,
    'MODULE_DECISION_LOG',
    `## Module Decision Log\n\n<details>\n<summary>Approval records</summary>\n\n### Approval #1 — current specification set\n- **Status:** approved\n- **Reviewed set:** \`specs/${scope}/${scope}.spec.md\`, \`specs/${scope}/${module}/${module}.spec.md\`\n- **Independent review:** clean\n- **Operator decision:** approved\n- **Recorded:** 2026-09-02\n\n</details>`
  );
  document = replaceSection(document, 'RESEARCH', '## Research\n\nNo research documents.');
  document = replaceSection(
    document,
    'IMPLEMENTATION_INSIGHTS',
    `## Implementation Insights\nThe fixture has no non-trivial implementation caveats beyond its approved contracts.\n\n<details>\n<summary>Implementation notes</summary>\n\n- Keep validation deterministic and input immutable.\n\n</details>`
  );
  return document;
}

/** @purpose Render an actual task with durable Approval #2 evidence. | @param scope Owner scope slug. | @param acronym Ticket namespace. | @param requirementAcronym Requirement namespace. | @param module Module slug. | @param id Ticket identifier. | @param [operation] Public operation name. | @param [sourceFile] Implementation target. | @returns Canonical approved fixture ticket. */
export function canonicalTask(
  scope: string,
  acronym: string,
  requirementAcronym: string,
  module: string,
  id: string,
  operation = 'applyMove',
  sourceFile = 'src/game.ts'
): string {
  const testFile = sourceFile.replace(/\.ts$/, '.test.ts');
  const slugify = operation === 'slugify';
  const taskTitle = slugify ? 'Normalize URL slug' : 'Normalize game state';
  const semanticGoal = slugify
    ? 'Implement deterministic URL slug normalization'
    : 'Implement deterministic game-state normalization';
  let document = TEMPLATES.task.skeleton
    .replaceAll('<ACRONYM>', acronym)
    .replaceAll('<slug>', 'normalize')
    .replaceAll('<Task Title>', taskTitle)
    .replaceAll('<scope-name>', scope)
    .replaceAll('<module-name or N/A>', module)
    .replaceAll('<infrastructure-flat | scope-bootstrap | module>', 'module')
    .replaceAll('<relative owning spec path>', `./${module}.spec.md`)
    .replaceAll('<PortName>', operation)
    .replaceAll('<spec anchor>', `./${module}.spec.md#module-contracts`)
    .replaceAll('<AdapterName>', 'Rules')
    .replaceAll('<ConsumerName>', 'fixture-consumer')
    .replaceAll('<scope spec §>', `../${scope}.spec.md`)
    .replaceAll('<semantic goal one-liner>', semanticGoal)
    .replaceAll('<comma-separated Task-IDs or None>', 'None')
    .replaceAll('<count> (<YYYY-MM-DD> — <last reason>)', '0')
    .replaceAll('<Runtime Backing>', 'real-runtime')
    .replaceAll('<Verification Levels>', 'unit');
  document = document.replaceAll(`${acronym}-normalize`, id);
  document = replaceSection(
    document,
    'META',
    `## Meta\n- **Task-ID:** ${id}\n- **Status:** [ ] TODO\n- **Purpose:** implement deterministic ${operation} behavior\n- **Scope:** ${scope}\n- **Module:** ${module}\n- **Structural Owner:** module\n- **Owning Spec:** [Owning spec](./${module}.spec.md)\n- **Dependencies:** None\n- **Spec References:**\n  - Contract: [${operation}](./${module}.spec.md#module-contracts)\n- **Runtime Backing:** real-runtime\n- **Verification Levels:** contract, unit\n- **Deferred Runtime Scope:** None`
  );
  document = replaceSection(
    document,
    'PHASES_OVERVIEW',
    '## Phases Overview\n| ID | Kind | Deps | Status |\n|----|------|------|--------|\n| P1 | impl | — | [ ] |\n| P2 | test | P1 | [ ] |'
  );
  document = replaceSection(
    document,
    'PHASE_P1',
    `### P1 — impl\n- **Objective:** implement ${operation}\n- **Rules:**\n  - [typescript-rules](../../../ai/directives/coding/typescript-rules.xml)\n- **Spec Refs:**\n  - [${operation}](./${module}.spec.md#module-contracts)\n- **Target Files:**\n  - ${sourceFile}\n- **Deleted Files:**\n  - none\n- **Inputs:** none\n- **Exit:** implementation satisfies the approved contract`
  );
  document = replaceSection(
    document,
    'PHASE_P2',
    `### P2 — test\n- **Objective:** verify normal and boundary inputs\n- **Rules:**\n  - [testing-common](../../../ai/directives/testing/common.xml)\n  - [node-test](../../../ai/directives/testing/node-test.xml)\n- **Target Files:**\n  - ${testFile}\n- **Deleted Files:**\n  - none\n- **Inputs:** P1 handoff\n- **Exit:** tests pass`
  );
  document = replaceSection(
    document,
    'BDD',
    slugify
      ? `## Acceptance Criteria (BDD)\n**Feature:** ${scope} rules\n\n**Scenario:** slugify contract [contract] [${requirementAcronym}-REQ-1]\n- **Given** a caller uses the public contract\n- **When** slugify receives text\n- **Then** it returns a string\n\n**Scenario:** normal text [unit] [${requirementAcronym}-REQ-1]\n- **Given** mixed-case words\n- **When** slugify normalizes them\n- **Then** it returns lowercase hyphen-separated words\n\n**Scenario:** repeated separators [unit] [${requirementAcronym}-REQ-2]\n- **Given** repeated whitespace and punctuation\n- **When** slugify normalizes them\n- **Then** separators collapse without mutating the input\n\n**Scenario:** rejects invalid input [unit] [${requirementAcronym}-REQ-3]\n- **Given** a runtime value that is not a string\n- **When** slugify validates the value\n- **Then** it rejects the input with a validation error`
      : `## Acceptance Criteria (BDD)\n**Feature:** ${scope} rules\n\n**Scenario:** applyMove contract [contract] [${requirementAcronym}-REQ-1]\n- **Given** a caller uses the public contract\n- **When** applyMove receives a board and move\n- **Then** it returns the declared result type\n\n**Scenario:** legal move [unit] [${requirementAcronym}-REQ-1]\n- **Given** an empty board\n- **When** applyMove receives a legal move\n- **Then** a new board is returned\n\n**Scenario:** illegal move [unit] [${requirementAcronym}-REQ-2]\n- **Given** an occupied square\n- **When** applyMove receives the move\n- **Then** validation fails without mutation`
  );
  document = replaceSection(
    document,
    'VERIFICATION',
    `## Verification\n\n<!--PHASE_RECEIPTS:v1-->\n\n<!--COVERAGE_POLICY:v1-->\n- **Coverage Policy:** required\n- **Coverage Owner Phase:** P2\n\n| Command | Required by | Role |\n|---------|-------------|------|\n| \`npx gennady testcov --min=80 ${sourceFile}\` | node-test | coverage |`
  );
  document = replaceSection(
    document,
    'TEST_COVERAGE',
    slugify
      ? `## Test Scenario Coverage\n- slugify contract → \`${testFile}\` :: \`[${requirementAcronym}-REQ-1] slugify contract\`\n- normal text → \`${testFile}\` :: \`[${requirementAcronym}-REQ-1] normal text\`\n- repeated separators → \`${testFile}\` :: \`[${requirementAcronym}-REQ-2] repeated separators\`\n- rejects invalid input → \`${testFile}\` :: \`[${requirementAcronym}-REQ-3] rejects invalid input\``
      : `## Test Scenario Coverage\n- applyMove contract → \`${testFile}\` :: \`[${requirementAcronym}-REQ-1] applyMove contract\`\n- legal move → \`${testFile}\` :: \`[${requirementAcronym}-REQ-1] legal move\`\n- illegal move → \`${testFile}\` :: \`[${requirementAcronym}-REQ-2] illegal move\``
  );
  document = replaceSection(
    document,
    'EXECUTION_LOG',
    `## Execution Log
*(Round = one execute-then-audit attempt; per-phase blocks within a Round. A checked line still carrying an unreplaced angle-bracket token is a fabricated DONE.)*

### Round 1 — <YYYY-MM-DD>, initial

#### P1
- [ ] \`<ts>\` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### P2
- [ ] \`<ts>\` DONE
**Handoff →** artifacts: [...]; decisions: [...]; open: [...]

#### Round close
- [ ] \`<ts>\` DONE`
  );
  document = replaceSection(document, 'DECISION_LOG', '## Decision Log\n');
  return document;
}

/** @purpose Render the canonical module task index with fixture-owned Approval #2. | @param scope Owner scope slug. | @param module Module slug. | @param acronym Ticket namespace. | @param id Ticket identifier. | @param [title] Ticket summary. | @returns Canonical fixture module index. */
export function canonicalModuleIndex(
  scope: string,
  module: string,
  acronym: string,
  id: string,
  title = 'Normalize game state'
): string {
  return `# ${module} — Tasks\n\n## Tracker Index\n| Task-ID | Title | Dependencies | Status | Reopens |\n|---------|-------|--------------|--------|---------|\n| ${id} | ${title} | — | [ ] TODO | — |\n\n## Slug Registry\n- normalize\n\n## Intra-Module DAG\n\`\`\`mermaid\ngraph TD\n  normalize\n\`\`\`\n\n## Approval #2 — decomposition and test plan\n- **Status:** approved\n- **Reviewed tickets:** \`specs/${scope}/${module}/${module}.task.${id}.md\`\n- **Independent review:** clean\n- **Operator decision:** approved\n- **Recorded:** 2026-09-02\n\n## Decision Log (module-task level)\n- ${acronym}-DL-2 2026-09-02 — approved the actual ticket and test plan (${scope}/${module}).\n\n## Conventions\nProject-wide conventions are declared once in specs/3-tasks.md and inherited here.`;
}
