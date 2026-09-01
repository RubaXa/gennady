// @file: Cross-tool regression for one executable bootstrap → config → command-smoke ticket.
// @consumers: sdd-new, sdd-check, sdd-task, sdd-verify
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rmSync, writeFileSync } from 'node:fs';
import { buildRepoFixture } from './fixture.ts';
import { runCli } from './run-cli.ts';

const TICKET_PATH = 'specs/infra-base/infra-base.task.IB-tools.md';

const TICKET = [
  '# Task: IB-tools — Bootstrap the project toolchain',
  '<!--SECTION:META-->',
  '## Meta',
  '- **Task-ID:** IB-tools',
  '- **Status:** [ ] TODO',
  '- **Purpose:** install, configure, and prove the project toolchain',
  '- **Scope:** infra-base',
  '- **Module:** N/A',
  '- **Structural Owner:** infrastructure-flat',
  '- **Owning Spec:** [Owning spec](./infra-base.spec.md)',
  '- **Dependencies:** None',
  '- **Spec References:**',
  '  - Contract: [Toolchain](./infra-base.spec.md#service-toolchain)',
  '- **Runtime Backing:** not-implemented',
  '- **Verification Levels:** contract, integration',
  '- **Deferred Runtime Scope:** None',
  '<!--/SECTION:META-->',
  '<!--SECTION:PHASES_OVERVIEW-->',
  '## Phases Overview',
  '| ID | Kind | Deps | Status |',
  '|---|---|---|---|',
  '| P1 | bootstrap | — | [ ] |',
  '| P2 | config | P1 | [ ] |',
  '| P3 | test | P2 | [ ] |',
  '<!--/SECTION:PHASES_OVERVIEW-->',
  '<!--SECTION:PHASE_P1-->',
  '### P1 — bootstrap',
  '- **Objective:** install the declared toolchain packages',
  '- **Capability Adapter:** node',
  '- **Bootstrap Action:** dependency-install',
  '- **Provides Packages:** typescript',
  '- **Provides Capabilities:** node.runtime-version, node.manifest-engine, node.manifest-module-kind, node.registry-config, node.dependencies, node.runtime, node.package-manager',
  '- **Requires Capabilities:** node.runtime',
  '- **Rules:**',
  '  - [nodejs-npm-setup](../../ai/directives/infra/nodejs-npm-setup.xml)',
  '- **Target Files:**',
  '  - package.json',
  '  - package-lock.json',
  '  - .nvmrc',
  '  - .npmrc',
  '- **Deleted Files:**',
  '  - none',
  '- **Inputs:** none',
  '- **Exit:** the package and lockfile declare the compiler',
  '<!--/SECTION:PHASE_P1-->',
  '<!--SECTION:PHASE_P2-->',
  '### P2 — config',
  '- **Objective:** configure the compiler command',
  '- **Capability Adapter:** typescript',
  '- **Provides Capabilities:** typescript.compiler',
  '- **Requires Capabilities:** node.package-manager, node.dependencies',
  '- **Requires Packages:** typescript',
  '- **Rules:**',
  '  - none',
  '- **Target Files:**',
  '  - tsconfig.json',
  '- **Deleted Files:**',
  '  - none',
  '- **Inputs:** P1 handoff',
  '- **Exit:** the compiler configuration exists',
  '<!--/SECTION:PHASE_P2-->',
  '<!--SECTION:PHASE_P3-->',
  '### P3 — test',
  '- **Objective:** prove the exact compiler command',
  '- **Capability Adapter:** typescript',
  '- **Requires Capabilities:** typescript.compiler',
  '- **Requires Packages:** typescript',
  '- **Rules:**',
  '  - none',
  '- **Target Files:**',
  '  - test/toolchain-smoke.test.ts',
  '- **Deleted Files:**',
  '  - none',
  '- **Inputs:** P2 handoff',
  '- **Exit:** the smoke test and exact command pass',
  '<!--/SECTION:PHASE_P3-->',
  '<!--SECTION:BDD-->',
  '## Acceptance Criteria (BDD)',
  '**Scenario:** exposes the toolchain contract [`contract`] `[IB-REQ-1]`',
  '- **Given** the project toolchain contract',
  '- **When** its compiler command is selected',
  '- **Then** the command is defined by the owning infrastructure spec',
  '',
  '**Scenario:** runs the compiler command [`integration`] `[IB-REQ-2]`',
  '- **Given** dependencies and compiler configuration exist',
  '- **When** `npm run type-check` runs',
  '- **Then** it exits successfully',
  '',
  '**Scenario:** rejects a missing compiler config [`integration`] `[IB-REQ-3]`',
  '- **Given** the compiler configuration is absent',
  '- **When** `npm run type-check` runs',
  '- **Then** it exits with a configuration error',
  '<!--/SECTION:BDD-->',
  '<!--SECTION:VERIFICATION-->',
  '## Verification',
  '<!--COVERAGE_POLICY:v1-->',
  '- **Coverage Policy:** not-applicable',
  '- **Coverage Reason:** this ticket proves project tooling rather than production behavior',
  '| Command | Required by | Role |',
  '|---|---|---|',
  '| `npm run type-check` | IB-REQ-2 | probe |',
  '<!--/SECTION:VERIFICATION-->',
  '<!--SECTION:TEST_COVERAGE-->',
  '## Test Scenario Coverage',
  '- exposes the toolchain contract → `test/toolchain-smoke.test.ts` :: `exposes the toolchain contract`',
  '- runs the compiler command → `test/toolchain-smoke.test.ts` :: `runs the compiler command` :: command `npm run type-check`',
  '- rejects a missing compiler config → `test/toolchain-smoke.test.ts` :: `rejects a missing compiler config` :: command `npm run type-check`',
  '<!--/SECTION:TEST_COVERAGE-->',
  '<!--SECTION:EXECUTION_LOG-->',
  '## Execution Log',
  '- pending',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

describe('bootstrap ticket lifecycle', () => {
  it('is accepted by authoring and feasibility, then exposes only existing P1 inputs to execute', () => {
    const { root } = buildRepoFixture({
      files: {
        'package-lock.json': '{"lockfileVersion":3}\n',
        'ai/directives/infra/nodejs-npm-setup.xml':
          '<Rule id="nodejs-npm-setup">Apply Node/npm bootstrap order.</Rule>\n',
        'specs/infra-base/infra-base.spec.md':
          '# Infra base\n\n<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->\n\n#### Service: `Toolchain`\n\nOwns the compiler contract.\n',
        [TICKET_PATH]: TICKET,
      },
    });
    try {
      const authoring = runCli(['sdd-check', '--task', TICKET_PATH, '--authoring'], root);
      assert.strictEqual(authoring.exitCode, 0, authoring.stdout + authoring.stderr);

      const feasibility = runCli(['sdd-check', '--scaffold-feasibility'], root);
      assert.strictEqual(feasibility.exitCode, 0, feasibility.stdout + feasibility.stderr);

      const dispatch = runCli(['sdd-task', TICKET_PATH, '--phase', 'P1'], root);
      assert.strictEqual(dispatch.exitCode, 0, dispatch.stdout + dispatch.stderr);
      assert.match(dispatch.stdout, /READ files:\s+package\.json, package-lock\.json/);
      assert.doesNotMatch(
        dispatch.stdout,
        /(?:READ|CREATE) files:[^\n]*(?:tsconfig\.json|toolchain-smoke\.test\.ts)/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('validates the exact ESLint rule only for an explicitly selected ESLint capability', () => {
    const eslintPhase = [
      '<!--SECTION:PHASE_P4-->',
      '### P4 — config',
      '- **Objective:** configure the selected ESLint lint gate',
      '- **Capability Adapter:** typescript-quality',
      '- **Provides Capabilities:** typescript.eslint-lint-tooling',
      '- **Requires Capabilities:** typescript.compiler, node.dependencies',
      '- **Requires Packages:** eslint, eslint-config-prettier',
      '- **Rules:**',
      '  - [eslint-setup](../../ai/directives/infra/eslint-setup.xml)',
      '- **Target Files:**',
      '  - package.json',
      '  - eslint.config.mjs',
      '- **Deleted Files:**',
      '  - none',
      '- **Inputs:** P2 handoff',
      '- **Exit:** the lint command and config are materialized',
      '<!--/SECTION:PHASE_P4-->',
    ].join('\n');
    const eslintTicket = TICKET.replace(
      '| P3 | test | P2 | [ ] |',
      '| P3 | test | P2 | [ ] |\n| P4 | config | P2 | [ ] |'
    ).replace('<!--SECTION:PHASE_P3-->', `${eslintPhase}\n<!--SECTION:PHASE_P3-->`);
    const { root } = buildRepoFixture({
      files: {
        'ai/directives/infra/nodejs-npm-setup.xml':
          '<Rule id="nodejs-npm-setup">Apply Node/npm bootstrap order.</Rule>\n',
        'specs/infra-base/infra-base.spec.md':
          '# Infra base\n\n<!--SECTION:SCOPE_TYPE-->\ninfrastructure\n<!--/SECTION:SCOPE_TYPE-->\n\n#### Service: `Toolchain`\n\nOwns the compiler contract.\n',
        [TICKET_PATH]: eslintTicket,
      },
    });
    try {
      const missing = runCli(['sdd-check', '--task', TICKET_PATH, '--authoring'], root);
      assert.notStrictEqual(missing.exitCode, 0, missing.stdout + missing.stderr);
      assert.match(missing.stdout + missing.stderr, /eslint-setup\.xml/);

      writeFileSync(
        `${root}/ai/directives/infra/eslint-setup.xml`,
        '<Rule id="eslint-setup">Apply ESLint only when selected.</Rule>\n',
        'utf8'
      );
      const valid = runCli(['sdd-check', '--task', TICKET_PATH, '--authoring'], root);
      assert.strictEqual(valid.exitCode, 0, valid.stdout + valid.stderr);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
