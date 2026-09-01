// @file: CLI proof barriers before spec approval and scaffold Gate 1.
// @consumers: SddCheckCommand
// @tasks: N/A

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { projectSpecDigest } from '../../../../shared/sdd/project-feasibility.ts';

let root: string;
let run: typeof import('../sdd-check.cmd.ts').run;
let originalArgv: string[];
let originalExit: typeof process.exit;

function portal(): string {
  return [
    '# Fixture',
    '## Scope Graph',
    '```mermaid',
    'graph TD',
    '  app --> infra',
    '```',
    '## Scopes',
    '| Scope | Type | Spec | Description |',
    '|---|---|---|---|',
    '| [`infra`](./infra/infra.spec.md) | infrastructure | ✅ | Infra |',
    '| [`app`](./app/app.spec.md) | product | ✅ | App |',
  ].join('\n');
}

function spec(scope: string, row: string, legacy = false): string {
  return [
    `# ${scope}`,
    '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
    '## Prerequisites',
    legacy
      ? '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |'
      : '| ID | Requirement | Kind | Owner | Resolution | Capability Adapter | Provides Capabilities | Requires Capabilities | Readiness Gates | Gate Artifacts |',
    legacy ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|---|---|---|---|---|',
    row,
    '<!--/SECTION:BOOTSTRAP_REQUIREMENTS-->',
  ].join('\n');
}

describe('sdd-check project transition barriers', () => {
  before(async () => {
    originalArgv = process.argv;
    originalExit = process.exit;
    process.argv = ['node', 'gennady', 'sdd-check'];
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    ({ run } = await import('../sdd-check.cmd.ts'));
    root = mkdtempSync(join(tmpdir(), 'gennady-project-feasibility-'));
    mkdirSync(join(root, 'specs', 'infra'), { recursive: true });
    mkdirSync(join(root, 'specs', 'app'), { recursive: true });
    writeFileSync(join(root, 'specs', 'README.md'), portal());
  });

  after(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    rmSync(root, { recursive: true, force: true });
  });

  it('--project-feasibility rejects old specs before scaffold', async () => {
    writeFileSync(
      join(root, 'specs', 'infra', 'infra.spec.md'),
      spec(
        'infra',
        '| install tools | package | this-scope-task | install | test | package.json |',
        true
      )
    );
    writeFileSync(
      join(root, 'specs', 'app', 'app.spec.md'),
      spec('app', '| runtime files | file | this-scope-task | create | — | .nvmrc, .npmrc |', true)
    );

    const result = await run(['node', 'gennady', 'sdd-check', '--project-feasibility', root]);

    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_PROJECT_BOOTSTRAP_FACTS_MISSING/);
    assert.match(result.text, /before spec approval/);
  });

  it('--scaffold-plan rejects a fresh but causally unordered pre-Gate-1 plan', async () => {
    const infra = spec(
      'infra',
      '| INFRA-RUNTIME | runtime files | file | this-scope-task | create | node | node.runtime-version, node.registry-config, node.runtime, node.package-manager | — | — | .nvmrc, .npmrc |'
    );
    const app = spec(
      'app',
      '| APP-DEPS | app packages | package | this-scope-task | install | node | node.dependencies | node.runtime-version, node.registry-config, node.package-manager | — | package.json, package-lock.json |'
    );
    writeFileSync(join(root, 'specs', 'infra', 'infra.spec.md'), infra);
    writeFileSync(join(root, 'specs', 'app', 'app.spec.md'), app);
    const planPath = join(root, 'plan.json');
    writeFileSync(
      planPath,
      JSON.stringify({
        schema: 'sdd-scaffold-plan/v1',
        specs: [
          {
            path: 'specs/app/app.spec.md',
            digest: projectSpecDigest(app),
          },
          {
            path: 'specs/infra/infra.spec.md',
            digest: projectSpecDigest(infra),
          },
        ],
        nodes: [
          {
            id: 'INFRA-bootstrap/P1',
            scope: 'infra',
            dependencies: [],
            requirementIds: ['INFRA-RUNTIME'],
            adapter: 'node',
            action: null,
            targets: ['.nvmrc', '.npmrc'],
            provides: [
              'node.runtime-version',
              'node.registry-config',
              'node.runtime',
              'node.package-manager',
            ],
            requires: [],
          },
          {
            id: 'APP-install/P1',
            scope: 'app',
            dependencies: [],
            requirementIds: ['APP-DEPS'],
            adapter: 'node',
            action: 'dependency-install',
            targets: ['package.json', 'package-lock.json'],
            provides: ['node.dependencies'],
            requires: ['node.runtime-version', 'node.registry-config', 'node.package-manager'],
          },
        ],
      })
    );

    const result = await run([
      'node',
      'gennady',
      'sdd-check',
      '--scaffold-plan',
      'plan.json',
      root,
    ]);

    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_SCAFFOLD_PLAN_CAPABILITY_PREREQUISITE_ORDER/);
    assert.match(result.text, /before Gate 1/);
  });
});
