// @file: Black-box CLI barriers before scaffold Gate 1.
// @consumers: SddCheckCommand
// @tasks: N/A

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  deriveProjectFeasibilityContext,
  projectSpecDigest,
  type ProjectSpecRef,
} from '../../../../shared/sdd/project-feasibility.ts';

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

function spec(scope: string, rows: string[]): string {
  return [
    `# ${scope}`,
    '<!--SECTION:BOOTSTRAP_REQUIREMENTS-->',
    '| Requirement | Kind | Owner | Resolution | Readiness Gates | Gate Artifacts |',
    '|---|---|---|---|---|---|',
    ...rows,
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

  it('--project-feasibility rejects runtime owned after the first package install', async () => {
    writeFileSync(
      join(root, 'specs', 'infra', 'infra.spec.md'),
      spec('infra', [
        '| install tools | package | this-scope-task | install | — | package.json, package-lock.json |',
      ])
    );
    writeFileSync(
      join(root, 'specs', 'app', 'app.spec.md'),
      spec('app', [
        '| Node/npm runtime | file | this-scope-task | create | — | .nvmrc, package.json, .npmrc |',
      ])
    );
    const result = await run(['node', 'gennady', 'sdd-check', '--project-feasibility', root]);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.text, /SDD_PROJECT_CAPABILITY_PREREQUISITE_ORDER/);
  });

  it('--scaffold-plan rejects a causally unordered pre-Gate-1 plan', async () => {
    const infra = spec('infra', [
      '| Node/npm runtime | file | this-scope-task | create | — | .nvmrc, package.json, .npmrc |',
    ]);
    const app = spec('app', [
      '| app packages | package | this-scope-task | install | — | package.json, package-lock.json |',
    ]);
    writeFileSync(join(root, 'specs', 'infra', 'infra.spec.md'), infra);
    writeFileSync(join(root, 'specs', 'app', 'app.spec.md'), app);
    const refs: ProjectSpecRef[] = [
      { file: 'specs/infra/infra.spec.md', scope: 'infra', dependencies: [], content: infra },
      { file: 'specs/app/app.spec.md', scope: 'app', dependencies: ['infra'], content: app },
    ];
    const context = deriveProjectFeasibilityContext(refs);
    const planPath = join(root, 'plan.json');
    writeFileSync(
      planPath,
      JSON.stringify({
        schema: 'sdd-scaffold-plan/v1',
        specs: refs.map((ref) => ({ path: ref.file, digest: projectSpecDigest(ref.content) })),
        nodes: [
          {
            id: 'INFRA-runtime/P1',
            scope: 'infra',
            dependencies: [],
            requirementRefs: [context.requirements.find((item) => item.scope === 'infra')!.ref],
            adapter: 'node',
            action: null,
            targets: ['.nvmrc', 'package.json', '.npmrc'],
            provides: [
              'node.runtime-version',
              'node.manifest-engine',
              'node.manifest-module-kind',
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
            requirementRefs: [context.requirements.find((item) => item.scope === 'app')!.ref],
            adapter: 'node',
            action: 'dependency-install',
            targets: ['package.json', 'package-lock.json'],
            provides: ['node.dependencies'],
            requires: [
              'node.runtime-version',
              'node.manifest-engine',
              'node.manifest-module-kind',
              'node.registry-config',
              'node.package-manager',
            ],
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
  });
});
