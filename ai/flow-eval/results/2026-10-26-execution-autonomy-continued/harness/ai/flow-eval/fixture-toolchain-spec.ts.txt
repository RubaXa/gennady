// @file: Recovered specification of the actual Node eval fixture runners, not product behaviour.
// @spec: AI-SKILLS
// @consumers: provision fibonacci-library; fixture ownership regression

import { TEMPLATES } from '../../shared/sdd/templates.ts';

/** @purpose Recover the installed fixture infrastructure from its real commands and failure paths.
 * No product spec, task, approval or receipt is invented to satisfy project-wide completion. */
export function fixtureToolchainSpec(): string {
  const sections: Record<string, string> = {
    SPEC_ID: 'ET',
    SCOPE_TYPE: '## scope-type\ninfrastructure',
    VISION:
      '## Vision\nRun the fixture tests and produce coverage through the real Node toolchain.',
    OVERVIEW:
      '## Overview\n\n```mermaid\nflowchart LR\n  npm --> runner\n  runner --> tests\n  tests --> report\n```\n_Npm scripts delegate to subprocess runners and preserve their failure status._',
    SCOPE_DEPENDENCIES:
      '## Scope Dependencies\n- **Depends on:** none\n- **Provides rules to:** fibonacci',
    REQUIREMENTS_AND_CONSTRAINTS:
      '## Requirements & Constraints\n\n### Requirements\n\n### ET-REQ-1 [должен]\n**Когда** npm test starts, **the runner must** execute existing TypeScript test files with Node and propagate the terminal exit code; before tests exist the test wrapper returns zero without claiming test statistics.\n\n### ET-REQ-2 [должен · нештатная]\n**Если** the subprocess fails, **the runner must** return nonzero; the coverage wrapper must also fail when no test file exists.\n\n### ET-REQ-3 [должен]\n**Когда** coverage is requested with existing tests, **the coverage runner must** execute c8 and write coverage/coverage-final.json.\n\n### Out-of-Scope\n- Product algorithms, authored specifications and operator approvals.\n\n### Runtime & Deferred Scope\nNo deferred runner behaviour.\n\n### Rules\n| Rule | Category | Source |\n|---|---|---|\n| node-test | testing | ai/directives/testing/node-test.xml |',
    TOOL_STACK:
      '## Tool Stack\n\n### Categories Covered\nNode test execution and c8 coverage; no remote CI.\n\n### Tool Choices\n| Category | Tool | Rationale |\n|---|---|---|\n| runtime | Node 22+ | fixture runtime |\n| coverage | c8 ^12 | V8 coverage adapter |\n\n### Integration Detail\n- Node: spawn process.execPath with inherited output; preserve exit status.\n- c8: execute through the installed local binary and collect JSON output.',
    WORKFLOW_EXAMPLE:
      '## Developer Workflow Example\n\n```bash\nnpm test\nnpm run test:coverage\n```\nA failure returns to the caller; no automatic approval or product repair occurs.',
    FILE_STRUCTURE:
      '## File Structure\n\n```text\nscripts/test.mjs\nscripts/test-coverage.mjs\n```\n\n**File Mapping:**\n- `scripts/test.mjs`: test discovery and Node invocation.\n- `scripts/test-coverage.mjs`: c8 invocation and coverage report.',
    EFFECTIVE_RULES:
      '## Effective Rules\nOne testing rule.\n\n<details>\n<summary>Rules</summary>\n\n| Rule | Category | Source |\n|---|---|---|\n| node-test | testing | ai/directives/testing/node-test.xml |\n\n</details>',
    VERIFICATION_COMMANDS:
      '## Verification Commands\n| Command Name | Invocation |\n|---|---|\n| typecheck-command | npm run type-check |\n| test-command | npm test |\n| coverage-command | npx gennady testcov src --min=100 |\n| lint-command | npm run lint |\n| format-command | npm run format |\n\nCoverage reads the c8 JSON report; generated coverage/ and node_modules/ remain ignored.',
    RESEARCH: '## Research\nNo external research; recovered from the shipped runner source.',
    DECISION_LOG:
      '## Decision Log\nRecovered fixture ownership only; no operator approval is implied.\n\n<details>\n<summary>Recovery provenance</summary>\n\nThe provisioned scripts and package.json are the evidence for this specification. Product authoring remains pending its own Approval #1.\n\n</details>',
    BOOTSTRAP_REQUIREMENTS:
      '## Prerequisites\nThe provisioner installs the toolchain before the scenario.\n\n<details>\n<summary>Prerequisites</summary>\n\n| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |\n|---|---|---|---|---|---|\n| Node and c8 | tool | operator-action | fixture provisioner | executable available | node_modules |\n\n</details>',
    HANDOFF:
      '## Handoff\n- **Setup tasks to scaffold:** none; existing fixture infrastructure.\n- **Effective rules ready for cascade:** node-test.\n- **Verification Commands ready for cascade:** table above.\n- **Open risks:** product test files do not exist until implementation.',
  };
  let document = TEMPLATES.infrastructure.skeleton.replaceAll('<scope-name>', 'eval-tools');
  for (const [name, body] of Object.entries(sections))
    document = document.replace(
      new RegExp(`<!--SECTION:${name}-->[\\s\\S]*?<!--/SECTION:${name}-->`),
      `<!--SECTION:${name}-->\n${body}\n<!--/SECTION:${name}-->`
    );
  return document;
}
