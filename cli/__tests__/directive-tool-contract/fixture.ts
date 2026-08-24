// @file: Minimal SDD-repo fixture for directive-tool-contract.test.ts — portal + one module spec +
//   one v2-named ticket + a tiny real source module, git-initialized so git-scoped tools (yagni,
//   sdd-check --changed, sdd-task --group-scope) see a real, clean HEAD.
// @consumers: directive-tool-contract.test.ts
// @tasks: N/A

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** @purpose Repo-root-relative paths of the fixture's key artifacts, for building CLI argv. */
export type Fixture = {
  /** @purpose Absolute fixture root — the cwd every CLI invocation runs from. */
  readonly root: string;
  /** @purpose `specs/demo/demo.task.DEMO-greet.md`, repo-relative. */
  readonly ticketPath: string;
  /** @purpose `specs/demo/demo.spec.md`, repo-relative. */
  readonly specPath: string;
  /** @purpose The ticket's Meta Task-ID. */
  readonly taskId: string;
};

const PORTAL = [
  '# Demo Project',
  '',
  '## Scopes',
  '',
  '| Scope | Type | Status | Description |',
  '|---|---|---|---|',
  '| [`demo`](./demo/demo.spec.md) | product | ✅ | demo scope for the tool-contract fixture |',
  '',
].join('\n');

const SPEC = [
  '# Demo — Module Spec',
  '',
  '## Module Contracts',
  '',
  '### Greeter',
  '',
  '- **Postcondition:** returns a greeting string containing the given name.',
  '',
  '<!--SECTION:ENTITY_INVENTORY-->',
  '',
  '## 3. Entity Inventory (Closed-World)',
  '',
  '| Name    | Type     | Purpose                   |',
  '| ------- | -------- | ------------------------- |',
  '| `greet` | Function | Greets a person by name.  |',
  '',
  '<!--/SECTION:ENTITY_INVENTORY-->',
  '',
].join('\n');

const TASK_ID = 'DEMO-greet';

function ticket(): string {
  return [
    `# Task: ${TASK_ID} — Greeting`,
    '',
    '<!--SECTION:META-->',
    '## 1. Meta',
    `- **Task-ID:** ${TASK_ID}`,
    '- **Status:** [ ] TODO',
    '- **Purpose:** Greet a person by name',
    '- **Scope:** demo',
    '- **Module:** demo',
    '- **Dependencies:** None',
    '- **Spec References:**',
    // Relative to this ticket's own directory (specs/demo/) — sdd-check's checkSpecRefs resolves
    // `resolve(dirname(ticketFile), target)`, not repo-root-relative (SDD_BROKEN_SPEC_REF).
    '  - Contract: [Module Contracts](demo.spec.md#module-contracts)',
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|----|------|------|--------|',
    '| P1 | impl | — | [ ] |',
    '| P2 | test | P1 | [ ] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '### P1 — impl',
    '- **Objective:** implement greet()',
    '- **Rules:**',
    // Same reason — resolved relative to specs/demo/, two hops up to the fixture root.
    '  - [typescript-rules](../../ai/directives/coding/typescript-rules.xml)',
    '- **Target Files:**',
    '  - src/greeter.ts',
    '- **Inputs:** none',
    '- **Exit:** greeter.ts compiles and exports greet',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:PHASE_P2-->',
    '### P2 — test',
    '- **Objective:** test greet()',
    '- **Rules:**',
    '  - [node-test](../../ai/directives/testing/node-test.xml)',
    '- **Target Files:**',
    '  - src/greeter.test.ts',
    '- **Inputs:** P1 handoff',
    '- **Exit:** tests pass',
    '<!--/SECTION:PHASE_P2-->',
    '<!--SECTION:VERIFICATION-->',
    '| Command | Required by |',
    '|---------|-------------|',
    '| npm run type-check | typescript-rules |',
    '| npm run test | node-test |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## 7. Execution Log',
    '<!--/SECTION:EXECUTION_LOG-->',
    '',
  ].join('\n');
}

function tracker(): string {
  return [
    '# demo — Tasks',
    '## 1. Tracker Index',
    '| Task-ID | Title | Dependencies | Status | Reopens |',
    '|---------|-------|--------------|--------|---------|',
    `| ${TASK_ID} | Greeting | — | [ ] TODO | — |`,
    '',
  ].join('\n');
}

const GREETER_TS = [
  '// @file: Greeter — builds a friendly greeting for a person by name.',
  '// @consumers: DemoApp',
  '// @tasks: DEMO-greet',
  '',
  '/**',
  ' * @purpose Build a greeting for the given name.',
  " * @param name Person's name.",
  ' * @returns A greeting string.',
  ' */',
  'export function greet(name: string): string {',
  '  return `Hello, ${name}!`;',
  '}',
  '',
].join('\n');

const GREETER_TEST_TS = [
  '// @file: Tests for greet() — basic greeting shape.',
  '// @consumers: greeter.ts',
  '// @tasks: DEMO-greet',
  '',
  "import { describe, it } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { greet } from '../src/greeter.ts';",
  '',
  "describe('greet', () => {",
  "  it('greets the given name', () => {",
  "    assert.strictEqual(greet('World'), 'Hello, World!');",
  '  });',
  '});',
  '',
].join('\n');

function packageJson(): string {
  return JSON.stringify(
    {
      name: 'demo-fixture',
      private: true,
      type: 'module',
      scripts: {
        'type-check': 'node -e "process.exit(0)"',
        test: 'node -e "process.exit(0)"',
        'test:coverage': 'node -e "process.exit(0)"',
        lint: 'node -e "process.exit(0)"',
        format: 'node -e "process.exit(0)"',
      },
    },
    null,
    2
  );
}

/**
 * @purpose Build a fresh, git-committed SDD-repo fixture in a new temp directory.
 * @invariant Working tree is clean at return — every mutating test case (sdd-log, sdd-sync) must
 *   call this again for its own isolated copy rather than share one instance.
 * @returns The fixture's root + repo-relative paths to its key artifacts.
 */
export function buildFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'gennady-directive-contract-'));

  mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  mkdirSync(join(root, 'ai', 'directives', 'sdd-v2'), { recursive: true });
  mkdirSync(join(root, 'ai', 'directives', 'coding'), { recursive: true });
  mkdirSync(join(root, 'ai', 'directives', 'testing'), { recursive: true });
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });

  writeFileSync(join(root, 'package.json'), packageJson(), 'utf-8');
  writeFileSync(join(root, 'specs', 'README.md'), PORTAL, 'utf-8');
  writeFileSync(join(root, 'specs', 'demo', 'demo.spec.md'), SPEC, 'utf-8');
  writeFileSync(join(root, 'specs', 'demo', `demo.task.${TASK_ID}.md`), ticket(), 'utf-8');
  writeFileSync(join(root, 'specs', 'demo', 'demo.3-tasks.md'), tracker(), 'utf-8');
  writeFileSync(join(root, 'src', 'greeter.ts'), GREETER_TS, 'utf-8');
  writeFileSync(join(root, 'test', 'greeter.test.ts'), GREETER_TEST_TS, 'utf-8');
  writeFileSync(join(root, 'node_modules', '.bin', 'gennady'), '', 'utf-8');
  // Minimal but structurally real rule files — just enough for the Rules: links in the ticket to
  // resolve on disk (SDD_BROKEN_RULE_LINK); content depth is not this fixture's concern.
  writeFileSync(
    join(root, 'ai', 'directives', 'coding', 'typescript-rules.xml'),
    '<Rule id="typescript-rules"><Mission>stub</Mission></Rule>\n',
    'utf-8'
  );
  writeFileSync(
    join(root, 'ai', 'directives', 'testing', 'node-test.xml'),
    '<Rule id="node-test"><Mission>stub</Mission></Rule>\n',
    'utf-8'
  );

  // Stub key directive files — sdd-state only checks for their existence (SDD_V2_SUBDIR /
  // KEY_DIRECTIVE_FILES), never their content.
  for (const f of [
    'router.directive.xml',
    'execute.directive.xml',
    'phase-execution-protocol.directive.xml',
    'preflight-protocol.directive.xml',
    'formats/requirement-entry-format.xml',
  ]) {
    const target = join(root, 'ai', 'directives', 'sdd-v2', f);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, '<Stub/>\n', 'utf-8');
  }

  execSync('git init -q', { cwd: root });
  execSync('git config user.email test@example.com', { cwd: root });
  execSync('git config user.name test', { cwd: root });
  execSync('git add -A', { cwd: root });
  execSync('git commit -q -m init', { cwd: root });

  return {
    root,
    ticketPath: join('specs', 'demo', `demo.task.${TASK_ID}.md`),
    specPath: join('specs', 'demo', 'demo.spec.md'),
    taskId: TASK_ID,
  };
}
