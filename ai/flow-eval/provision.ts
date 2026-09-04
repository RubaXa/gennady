// @file: Safe per-scenario workspace provisioner.
// @consumers: CLI, SddEvalRunner tests; never removes existing directories.

import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { TEMPLATES } from '../../shared/sdd/templates.ts';
import type { SddEvalFixtureId, SddEvalScenario } from './types.ts';

const execFileAsync = promisify(execFile);

/** @purpose Replace one canonical template section while preserving its paired anchors. */
function replaceSection(document: string, name: string, body: string): string {
  const pattern = new RegExp(`<!--SECTION:${name}-->[\\s\\S]*?<!--/SECTION:${name}-->`, 'm');
  return document.replace(
    pattern,
    `<!--SECTION:${name}-->\n${body.trim()}\n<!--/SECTION:${name}-->`
  );
}

/** @purpose Render a filled scope template with the V2 structural contract, not a hand-written heading. */
function canonicalScope(
  scope: string,
  acronym: string,
  module: string,
  operation = 'applyMove'
): string {
  const slugify = operation === 'slugify';
  let document = TEMPLATES.product.skeleton
    .replaceAll('<scope-name>', scope)
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

/** @purpose Render a canonical module artifact from the shared V2 template registry. */
function canonicalModule(
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

/** @purpose Render an actual task and module index with the durable Approval #2 evidence. */
function canonicalTask(
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

function canonicalModuleIndex(
  scope: string,
  module: string,
  acronym: string,
  id: string,
  title = 'Normalize game state'
): string {
  return `# ${module} — Tasks\n\n## Tracker Index\n| Task-ID | Title | Dependencies | Status | Reopens |\n|---------|-------|--------------|--------|---------|\n| ${id} | ${title} | — | [ ] TODO | — |\n\n## Slug Registry\n- normalize\n\n## Intra-Module DAG\n\`\`\`mermaid\ngraph TD\n  normalize\n\`\`\`\n\n## Approval #2 — decomposition and test plan\n- **Status:** approved\n- **Reviewed tickets:** \`specs/${scope}/${module}/${module}.task.${id}.md\`\n- **Independent review:** clean\n- **Operator decision:** approved\n- **Recorded:** 2026-09-02\n\n## Decision Log (module-task level)\n- ${acronym}-DL-2 2026-09-02 — approved the actual ticket and test plan (${scope}/${module}).\n\n## Conventions\nProject-wide conventions are declared once in specs/3-tasks.md and inherited here.`;
}

const REAL_TS_CONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
`;

const REAL_GITIGNORE = `.claude/settings.local.json
.env
.env.local
.env.*.local
.DS_Store
Thumbs.db
desktop.ini
.idea/
*.swp
.vscode/
coverage/
*.lcov
.nyc_output/
*.log
npm-debug.log*
yarn-error.log
node_modules/
dist/
.cache/
`;

const REAL_COVERAGE_RUNNER = `import { spawn } from 'node:child_process';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = [];
for await (const file of glob('src/**/*.test.ts')) files.push(file);
files.sort();
if (files.length === 0) process.exit(1);
const exitCode = await new Promise((resolveExit) => {
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/c8/bin/c8.js'),
      '--reporter=json',
      '--reports-dir=coverage',
      '--all',
      '--extension=.ts',
      '--include=src/**/*.ts',
      '--exclude=src/**/*.test.ts',
      process.execPath,
      '--test',
      ...files,
    ],
    { stdio: 'inherit' }
  );
  child.once('error', () => resolveExit(1));
  child.once('exit', (code) => resolveExit(code ?? 1));
});
process.exitCode = exitCode;
`;

const REAL_TEST_RUNNER = `import { spawn } from 'node:child_process';
import { glob } from 'node:fs/promises';

const files = [];
for await (const file of glob('src/**/*.test.ts')) files.push(file);
files.sort();
if (files.length === 0) process.exit(0);
const exitCode = await new Promise((resolveExit) => {
  const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  child.once('error', () => resolveExit(1));
  child.once('exit', (code) => resolveExit(code ?? 1));
});
process.exitCode = exitCode;
`;

// ── infra-log-summary fixture (phase `task`) ─────────────────────────────────────────────────────
// A banal, deterministic infra job — no node install. Fixed sample log + a golden expected output +
// an independent verify script. Success criteria (per-eval golden) live in golden/, not in worker code.
const INFRA_LOG_BRIEF = `# Log summary task

Write \`bin/log-summary.sh\` — a bash script that reads an nginx-style access log whose path is its
first argument and prints EXACTLY this format (nothing else):

    total_requests: <N>
    server_errors: <N>
    top_ips:
    <ip> <count>
    <ip> <count>
    <ip> <count>

Rules:
- \`total_requests\` = number of log lines. \`server_errors\` = lines whose HTTP status is 5xx.
- \`top_ips\` = the 3 client IPs (first field of each line) with the most requests, most first,
  each as \`<ip> <count>\`; ties broken by IP ascending.
- Use a shebang and \`set -euo pipefail\`. If the file argument is missing or does not exist, print a
  clear message to stderr and exit non-zero. Re-running on the same input must print the same output.
- No package installation. Only the script under bin/.
`;

// Fixed sample: 7 lines. status 500 + 503 = 2 server errors. IP counts 10.0.0.1=4, 10.0.0.2=2, 10.0.0.3=1.
const INFRA_LOG_SAMPLE = `10.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /a HTTP/1.1" 200 512
10.0.0.1 - - [10/Oct/2026:13:55:37 +0000] "GET /b HTTP/1.1" 500 190
10.0.0.2 - - [10/Oct/2026:13:55:38 +0000] "GET /a HTTP/1.1" 200 512
10.0.0.1 - - [10/Oct/2026:13:55:39 +0000] "POST /c HTTP/1.1" 503 0
10.0.0.3 - - [10/Oct/2026:13:55:40 +0000] "GET /a HTTP/1.1" 404 733
10.0.0.2 - - [10/Oct/2026:13:55:41 +0000] "GET /d HTTP/1.1" 200 88
10.0.0.1 - - [10/Oct/2026:13:55:42 +0000] "GET /e HTTP/1.1" 200 41
`;

const INFRA_LOG_EXPECTED = `total_requests: 7
server_errors: 2
top_ips:
10.0.0.1 4
10.0.0.2 2
10.0.0.3 1
`;

// Independent golden verifier — the objective per-eval success criterion (R2 + R6 for this task).
const INFRA_LOG_VERIFY = `#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/log-summary.sh"
[ -x "$script" ] || { echo "FAIL: bin/log-summary.sh missing or not executable"; exit 1; }
# R6: strict mode declared
grep -q 'set -euo pipefail' "$script" || { echo "FAIL: script lacks 'set -euo pipefail'"; exit 1; }
# R2: exact output on the fixed sample (command substitution strips trailing newlines on both sides)
got="$("$script" "$root/sample/access.log")"
exp="$(cat "$root/golden/expected.txt")"
if [ "$got" != "$exp" ]; then
  echo "FAIL: output mismatch"; echo "--- got ---"; printf '%s\\n' "$got"; echo "--- expected ---"; printf '%s\\n' "$exp"; exit 1
fi
# R6: missing file must fail (non-zero), not print a bogus summary
if "$script" "$root/sample/does-not-exist.log" >/dev/null 2>&1; then
  echo "FAIL: missing-file input did not exit non-zero"; exit 1
fi
# R2: idempotent — second run identical
got2="$("$script" "$root/sample/access.log")"
[ "$got" = "$got2" ] || { echo "FAIL: not idempotent"; exit 1; }
echo "PASS"
`;

/** @purpose Minimal prepared source trees used by the three cheap SDD eval scenarios. */
export const FIXTURE_FILES: Record<SddEvalFixtureId, Record<string, string>> = {
  'fibonacci-library': {
    '.gitignore': REAL_GITIGNORE,
    'inputs/brief.md':
      '# Fibonacci brief\nProvide a reusable TypeScript `nth(n: number): number` API. Accept only integer indexes from 0 through 77, with F(0)=0 and F(1)=1. Reject negative, non-integer, and greater-than-77 inputs with explicit errors. Keep the API pure and document every edge case. Author specifications only; no product code.\n',
    'README.md': '# Fibonacci library\n\nImplement the requested API and tests.\n',
    'scripts/test.mjs': REAL_TEST_RUNNER,
    'scripts/test-coverage.mjs': REAL_COVERAGE_RUNNER,
    'tsconfig.json': REAL_TS_CONFIG,
    'package.json':
      JSON.stringify(
        {
          name: 'fibonacci-library',
          private: true,
          type: 'module',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: 'node scripts/test.mjs',
            // Coverage runs through a `.mjs` wrapper, not an inline c8 command: the phase receipt
            // fingerprints every path token in package.json verification scripts and rejects globs
            // (shared/common/repo-path.ts), so an inline `c8 --include=src/**/*.ts … node --test
            // src/*.test.ts` breaks `sdd-verify`. The wrapper keeps the script a single exact-file
            // token, and the ticket's `gennady testcov <src>` check only needs the produced
            // coverage-final.json — it does not re-detect the producer when the report exists.
            'test:coverage': 'node scripts/test-coverage.mjs',
            format: 'prettier --check "src/**/*.ts" package.json tsconfig.json',
            'format:fix': 'prettier --write',
            lint: './node_modules/.bin/gennady lint src/',
            'lint:fix': './node_modules/.bin/gennady lint --autofix',
            fix: 'npm run format:fix -- src && npm run lint:fix -- src',
          },
          devDependencies: { c8: '^12.0.0' },
        },
        null,
        2
      ) + '\n',
    'specs/README.md':
      '# Fixture Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n',
  },
  'tic-tac-toe': {
    '.gitignore': REAL_GITIGNORE,
    'inputs/brief.md':
      '# Tic-tac-toe brief\nModel legal moves and winner detection for a deterministic game.\n',
    'specs/README.md':
      '# Fixture Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n| [`tic-tac-toe`](./tic-tac-toe/tic-tac-toe.spec.md) | product | ✅ | deterministic board rules |\n',
    'specs/tic-tac-toe/tic-tac-toe.spec.md': canonicalScope('tic-tac-toe', 'TTT', 'engine'),
    'specs/tic-tac-toe/engine/engine.spec.md': canonicalModule('tic-tac-toe', 'ENG', 'engine'),
    'src/game.ts': 'export type Mark = "X" | "O";\nexport type Board = Array<Mark | null>;\n',
    'scripts/test.mjs': REAL_TEST_RUNNER,
    'scripts/test-coverage.mjs': REAL_COVERAGE_RUNNER,
    'tsconfig.json': REAL_TS_CONFIG,
    'package.json':
      JSON.stringify(
        {
          name: 'tic-tac-toe',
          private: true,
          type: 'module',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: 'node scripts/test.mjs',
            // Coverage runs through a `.mjs` wrapper, not an inline c8 command: the phase receipt
            // fingerprints every path token in package.json verification scripts and rejects globs
            // (shared/common/repo-path.ts), so an inline `c8 --include=src/**/*.ts … node --test
            // src/*.test.ts` breaks `sdd-verify`. The wrapper keeps the script a single exact-file
            // token, and the ticket's `gennady testcov <src>` check only needs the produced
            // coverage-final.json — it does not re-detect the producer when the report exists.
            'test:coverage': 'node scripts/test-coverage.mjs',
            format: 'prettier --check "src/**/*.ts" package.json tsconfig.json',
            'format:fix': 'prettier --write',
            lint: './node_modules/.bin/gennady lint src/',
            'lint:fix': './node_modules/.bin/gennady lint --autofix',
            fix: 'npm run format:fix -- src && npm run lint:fix -- src',
          },
          devDependencies: { c8: '^12.0.0' },
        },
        null,
        2
      ) + '\n',
    'README.md': '# Tic-tac-toe\n\nImplement legal moves and winner detection.\n',
  },
  'slugify-toolchain': {
    '.gitignore': REAL_GITIGNORE,
    'inputs/brief.md':
      '# Slugify brief\nCreate stable URL slugs and keep the test/toolchain command reproducible.\n',
    'specs/README.md':
      '# Fixture Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n| [`slugify`](./slugify/slugify.spec.md) | library | ✅ | stable URL slugs |\n',
    'specs/3-tasks.md': '# Project Tasks\n\n## Entry Points\n- [Specs Portal](./README.md)\n',
    'specs/slugify/slugify.spec.md': canonicalScope('slugify', 'SLU', 'core', 'slugify'),
    'specs/slugify/core/core.spec.md': canonicalModule(
      'slugify',
      'COR',
      'core',
      'slugify',
      'src/slugify.ts'
    ),
    'specs/slugify/core/core.3-tasks.md': canonicalModuleIndex(
      'slugify',
      'core',
      'SLG',
      'SLG-slug',
      'Normalize URL slug'
    ),
    'specs/slugify/core/core.task.SLG-slug.md': canonicalTask(
      'slugify',
      'SLG',
      'COR',
      'core',
      'SLG-slug',
      'slugify',
      'src/slugify.ts'
    ),
    'src/slugify.ts': 'export function slugify(value: string): string { return value; }\n',
    'scripts/test.mjs': REAL_TEST_RUNNER,
    'scripts/test-coverage.mjs': REAL_COVERAGE_RUNNER,
    'tsconfig.json': REAL_TS_CONFIG,
    'package.json':
      JSON.stringify(
        {
          name: 'slugify-toolchain',
          private: true,
          type: 'module',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: 'node scripts/test.mjs',
            // Coverage runs through a `.mjs` wrapper, not an inline c8 command: the phase receipt
            // fingerprints every path token in package.json verification scripts and rejects globs
            // (shared/common/repo-path.ts), so an inline `c8 --include=src/**/*.ts … node --test
            // src/*.test.ts` breaks `sdd-verify`. The wrapper keeps the script a single exact-file
            // token, and the ticket's `gennady testcov <src>` check only needs the produced
            // coverage-final.json — it does not re-detect the producer when the report exists.
            'test:coverage': 'node scripts/test-coverage.mjs',
            format: 'prettier --check "src/**/*.ts" package.json tsconfig.json',
            'format:fix': 'prettier --write',
            lint: './node_modules/.bin/gennady lint src/',
            'lint:fix': './node_modules/.bin/gennady lint --autofix',
            fix: 'npm run format:fix -- src && npm run lint:fix -- src',
          },
          devDependencies: { c8: '^12.0.0' },
        },
        null,
        2
      ) + '\n',
  },
  'broken-specs': {
    '.gitignore': REAL_GITIGNORE,
    'inputs/brief.md':
      '# Calc brief\nA deterministic `nth` calculation module. Specs already exist; they must pass the mechanical checker.\n',
    'specs/README.md':
      '# Fixture Project\n\n## Scopes\n\n| Scope | Type | Spec | Description |\n|---|---|---|---|\n| [`calc`](./calc/calc.spec.md) | product | ✅ | deterministic calculation |\n',
    'specs/calc/calc.spec.md': canonicalScope('calc', 'CAL', 'nth'),
    // Structurally complete module spec with ONE deliberate defect: an invalid mermaid diagram
    // (unquoted parentheses in a node label) so `sdd-check` reports SDD_DIAGRAM_INVALID with its
    // top-causes hint. The repair scenario checks the worker self-corrects from that error alone.
    'specs/calc/nth/nth.spec.md': canonicalModule(
      'calc',
      'NTH',
      'nth',
      'compute',
      'src/nth.ts'
    ).replace(
      'flowchart LR\n  caller --> Rules\n  Rules --> caller',
      'flowchart LR\n  caller --> calc[compute F(n)]\n  calc --> caller'
    ),
    'src/nth.ts': 'export function nth(n: number): number {\n  return n;\n}\n',
    'scripts/test.mjs': REAL_TEST_RUNNER,
    'scripts/test-coverage.mjs': REAL_COVERAGE_RUNNER,
    'tsconfig.json': REAL_TS_CONFIG,
    'package.json':
      JSON.stringify(
        {
          name: 'broken-specs',
          private: true,
          type: 'module',
          scripts: {
            'type-check': 'tsc --noEmit',
            test: 'node scripts/test.mjs',
            // Coverage runs through a `.mjs` wrapper, not an inline c8 command: the phase receipt
            // fingerprints every path token in package.json verification scripts and rejects globs
            // (shared/common/repo-path.ts). The wrapper keeps the script a single exact-file token.
            'test:coverage': 'node scripts/test-coverage.mjs',
            format: 'prettier --check "src/**/*.ts" package.json tsconfig.json',
            'format:fix': 'prettier --write',
            lint: './node_modules/.bin/gennady lint src/',
            'lint:fix': './node_modules/.bin/gennady lint --autofix',
            fix: 'npm run format:fix -- src && npm run lint:fix -- src',
          },
          devDependencies: { c8: '^12.0.0' },
        },
        null,
        2
      ) + '\n',
  },
  'infra-log-summary': {
    '.gitignore': 'node_modules/\n',
    'inputs/brief.md': INFRA_LOG_BRIEF,
    'sample/access.log': INFRA_LOG_SAMPLE,
    'golden/expected.txt': INFRA_LOG_EXPECTED,
    'golden/verify.sh': INFRA_LOG_VERIFY,
    'README.md':
      '# Infra task fixture\n\nComplete the task in `inputs/brief.md`. Graded by `golden/verify.sh`.\n',
  },
};

/** @purpose Check custom scenario directories are unique before any worker is launched. */
export function assertUniqueScenarioDirectories(
  scenarios: Array<SddEvalScenario & { directory: string }>
): void {
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    const directory = resolve(scenario.directory);
    if (seen.has(directory)) throw new Error(`scenario directories must be unique: ${directory}`);
    seen.add(directory);
  }
}

/** @purpose Options for installing the current SDD flow and local CLI into a sandbox. */
type SddEvalProvisionOptions = {
  rootDirectory?: string;
  /** @purpose Source repository containing the assembled directives, skills, and dist CLI. */
  gennadyRoot?: string;
};

function findGennadyRoot(explicit?: string): string {
  const repoRoot = resolve(import.meta.dirname, '../..');
  const candidates = [
    explicit,
    process.env.GENNADY_ROOT,
    repoRoot,
    resolve(repoRoot, '..'),
    resolve(repoRoot, '../../..'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const source = candidates.find(
    (candidate) =>
      resolve(candidate) !== '/' &&
      existsSync(join(candidate, 'ai/skills/sdd')) &&
      existsSync(join(candidate, 'ai/directives/sdd-v2'))
  );
  if (!source) throw new Error('cannot resolve gennady root');
  if (!existsSync(join(source, 'dist'))) {
    throw new Error(`gennady dist is missing at ${join(source, 'dist')}; run npm run build first`);
  }
  return resolve(source);
}

async function materializeFlow(directory: string, gennadyRoot: string): Promise<void> {
  const skillSource = join(gennadyRoot, 'ai/skills/sdd');
  const skillTarget = join(directory, 'ai/skills/sdd');
  await cp(skillSource, skillTarget, { recursive: true });
  const directivesSource = join(gennadyRoot, 'ai/directives');
  const directivesTarget = join(directory, 'ai/directives');
  await cp(directivesSource, directivesTarget, { recursive: true });
  const skillsSource = join(gennadyRoot, 'ai/skills');
  const skillsTarget = join(directory, '.claude/skills');
  await mkdir(skillsTarget, { recursive: true });
  for (const entry of await readdir(skillsSource, { withFileTypes: true })) {
    if (!entry.name.startsWith('sdd')) continue;
    await cp(join(skillsSource, entry.name), join(skillsTarget, entry.name), { recursive: true });
  }
}

/** @purpose Initialize a real repository using an argument-vector-only child process. */
async function initGitRepository(directory: string): Promise<void> {
  await execFileAsync('git', ['init', '--quiet', '--initial-branch=main', directory]);
}

/** @purpose Commit the immutable fixture baseline so worker diffs and write-zone checks are real. */
async function commitFixtureBaseline(directory: string): Promise<void> {
  await execFileAsync('git', ['add', '--all'], { cwd: directory });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.name=SDD Eval',
      '-c',
      'user.email=sdd-eval@localhost',
      'commit',
      '--quiet',
      '-m',
      'chore: initialize eval fixture',
    ],
    { cwd: directory }
  );
}

/** @purpose Enqueue every dependency declared by a package and its nested package tree. */
async function enqueuePackageTreeDependencies(
  packageDirectory: string,
  dependencyQueue: string[],
  copied: ReadonlySet<string>,
  scanned: Set<string>
): Promise<void> {
  const canonicalDirectory = resolve(packageDirectory);
  if (scanned.has(canonicalDirectory)) return;
  scanned.add(canonicalDirectory);
  try {
    const manifest = JSON.parse(
      await readFile(join(canonicalDirectory, 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const child of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      if (!copied.has(child) && !dependencyQueue.includes(child)) dependencyQueue.push(child);
    }
  } catch {
    return;
  }
  const nestedRoot = join(canonicalDirectory, 'node_modules');
  if (!existsSync(nestedRoot)) return;
  for (const entry of await readdir(nestedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    if (entry.name.startsWith('@')) {
      const scope = join(nestedRoot, entry.name);
      for (const scopedEntry of await readdir(scope, { withFileTypes: true })) {
        if (scopedEntry.isDirectory())
          await enqueuePackageTreeDependencies(
            join(scope, scopedEntry.name),
            dependencyQueue,
            copied,
            scanned
          );
      }
      continue;
    }
    await enqueuePackageTreeDependencies(
      join(nestedRoot, entry.name),
      dependencyQueue,
      copied,
      scanned
    );
  }
}

/** @purpose Bind the built local CLI without package installation or network access. */
async function materializeLocalCli(
  directory: string,
  gennadyRoot: string,
  includeCoverageProducer: boolean
): Promise<void> {
  const packageTarget = join(directory, 'node_modules/gennady');
  const binTarget = join(directory, 'node_modules/.bin/gennady');
  // Idempotent for reused sandboxes (phase chaining: scaffold/execute run on the authoring
  // sandbox): if the local CLI is already materialized, re-copying over existing dependency
  // symlinks (e.g. mermaid's nested marked .bin) fails with cp EINVAL. Skip when present.
  if (existsSync(join(packageTarget, 'dist')) && existsSync(binTarget)) return;
  await mkdir(dirname(packageTarget), { recursive: true });
  await mkdir(dirname(binTarget), { recursive: true });
  // Copy the runnable package snapshot, never a symlink: worker writes in its sandbox must not
  // reach the source checkout. Keep only metadata, dist, and assembled ai assets.
  await mkdir(packageTarget, { recursive: true });
  await cp(join(gennadyRoot, 'package.json'), join(packageTarget, 'package.json'));
  await cp(join(gennadyRoot, 'dist'), join(packageTarget, 'dist'), { recursive: true });
  await cp(join(gennadyRoot, 'ai'), join(packageTarget, 'ai'), { recursive: true });
  // `sdd-check --all` loads the bundled XML/HTML checker, whose runtime dependency is jsdom. Copy
  // its local dependency closure from the already-installed checkout; no registry/network access
  // and no symlinks into the mutable source tree are allowed.
  const dependencyQueue = [
    'jsdom',
    'mermaid',
    'tree-sitter',
    'tree-sitter-typescript',
    'typescript',
    'prettier',
    '@types/node',
    ...(includeCoverageProducer ? ['c8'] : []),
  ];
  const copied = new Set<string>();
  const scanned = new Set<string>();
  while (dependencyQueue.length > 0) {
    const dependency = dependencyQueue.shift();
    if (!dependency || copied.has(dependency)) continue;
    copied.add(dependency);
    const sourcePackage = join(gennadyRoot, 'node_modules', dependency);
    const targetPackage = join(directory, 'node_modules', dependency);
    if (!existsSync(sourcePackage))
      throw new Error(`required local dependency is missing: ${dependency}`);
    await cp(sourcePackage, targetPackage, { recursive: true });
    await enqueuePackageTreeDependencies(sourcePackage, dependencyQueue, copied, scanned);
  }
  // The checked-in dist entrypoint is intentionally not executable in this checkout. Use a tiny
  // executable npm bin shim that invokes the immutable sandbox copy.
  await writeFile(
    binTarget,
    '#!/bin/sh\nexec node "$(dirname "$0")/../gennady/dist/gennady.js" "$@"\n',
    'utf8'
  );
  await chmod(binTarget, 0o755);
  for (const [name, entry] of [
    ['tsc', '../typescript/bin/tsc'],
    ['prettier', '../prettier/bin/prettier.cjs'],
  ] as const) {
    const target = join(directory, 'node_modules/.bin', name);
    await writeFile(target, `#!/bin/sh\nexec node "$(dirname "$0")/${entry}" "$@"\n`, 'utf8');
    await chmod(target, 0o755);
  }
}

/** @purpose Materialize fixture files into isolated temp directories without deleting user data. */
export async function provisionScenarioDirectories(
  scenarios: SddEvalScenario[],
  rootDirectoryOrOptions: string | SddEvalProvisionOptions = tmpdir(),
  gennadyRootOption?: string
): Promise<Array<SddEvalScenario & { directory: string }>> {
  const requestedRootDirectory =
    typeof rootDirectoryOrOptions === 'string'
      ? rootDirectoryOrOptions
      : (rootDirectoryOrOptions.rootDirectory ?? tmpdir());
  const resolvedRootDirectory = resolve(requestedRootDirectory);
  const rootDirectory = await realpath(resolvedRootDirectory).catch(() => resolvedRootDirectory);
  const gennadyRoot =
    typeof rootDirectoryOrOptions === 'string'
      ? gennadyRootOption
      : rootDirectoryOrOptions.gennadyRoot;
  const sourceRoot = findGennadyRoot(gennadyRoot);
  const provisioned: Array<SddEvalScenario & { directory: string }> = [];
  for (const scenario of scenarios) {
    if (scenario.fixture && scenario.directory) {
      throw new Error(`fixture scenario ${scenario.id} must use an auto-provisioned directory`);
    }
    const generatedDirectory = !scenario.directory;
    const directory = scenario.directory
      ? resolve(scenario.directory)
      : await mkdtemp(join(resolve(rootDirectory), 'sdd-flow-eval-'));
    if (generatedDirectory) await initGitRepository(directory);
    if (scenario.fixture) {
      const files = FIXTURE_FILES[scenario.fixture];
      if (!files) throw new Error(`unknown SDD eval fixture: ${scenario.fixture}`);
      for (const [relativePath, contents] of Object.entries(files)) {
        const target = join(directory, relativePath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents, 'utf8');
      }
    }
    await materializeFlow(directory, sourceRoot);
    // Every fixture ships the c8-based coverage runner (scripts/test-coverage.mjs) and a scaffold
    // whose coverage policy is `required`, so the coverage producer (c8 + its closure) must be
    // present for all of them — not just slugify-toolchain. Without c8 the declared `npm run
    // test:coverage` never writes coverage-final.json and the `gennady testcov` gate is
    // structurally unsatisfiable offline, so execute fails through no fault of the worker.
    await materializeLocalCli(directory, sourceRoot, true);
    if (generatedDirectory) await commitFixtureBaseline(directory);
    provisioned.push({ ...scenario, directory });
  }
  assertUniqueScenarioDirectories(provisioned);
  return provisioned;
}
