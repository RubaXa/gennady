// @file: Deterministic lock — a provisioned sandbox runs the FRESH local built dist, never a stale
//   copy and never a package bin. Guards the flow-eval provisioning fix (materializeLocalCli always
//   refreshes dist/ai/shim; only the dependency closure stays idempotent).
// @spec: AI-SKILLS
// @consumers: ai/flow-eval/provision

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { provisionScenarioDirectories } from '../provision.ts';
import { SddEvalSandboxLifecycle } from '../sandbox-lifecycle.ts';
import type { SddEvalScenario } from '../types.ts';

const temporaryRoots = new Set<string>();

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

/** @purpose A minimal on-disk gennady root (dist + assembled ai + fake dep dirs) for provisioning. */
function fakeGennadyRoot(distContent: string): string {
  const root = temporaryRoot('fake-gennady-');
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/gennady.js'), distContent);
  writeFileSync(join(root, 'package.json'), '{"name":"gennady","version":"0.0.0"}\n');
  mkdirSync(join(root, 'ai/skills/sdd'), { recursive: true });
  writeFileSync(join(root, 'ai/skills/sdd/SKILL.md'), '# sdd\n');
  mkdirSync(join(root, 'ai/directives/sdd-v2'), { recursive: true });
  writeFileSync(join(root, 'ai/directives/sdd-v2/router.directive.xml'), '<x/>\n');
  const dependencies = [
    'jsdom',
    'mermaid',
    'tree-sitter',
    'tree-sitter-typescript',
    'typescript',
    'prettier',
    '@types/node',
    'c8',
  ];
  const packages: Record<string, unknown> = {
    '': { name: 'gennady', version: '0.0.0' },
  };
  const installedPackages: Record<string, unknown> = {};
  for (const [index, dep] of dependencies.entries()) {
    mkdirSync(join(root, 'node_modules', dep), { recursive: true });
    const entry = {
      version: `1.0.${index}`,
      resolved: `https://registry.invalid/${dep}.tgz`,
      integrity: `sha512-${dep}`,
    };
    packages[`node_modules/${dep}`] = entry;
    installedPackages[`node_modules/${dep}`] = entry;
  }
  writeFileSync(
    join(root, 'package-lock.json'),
    `${JSON.stringify({ name: 'gennady', lockfileVersion: 3, packages })}\n`
  );
  writeFileSync(
    join(root, 'node_modules/.package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages: installedPackages })}\n`
  );
  return root;
}

function scenario(dir: string): SddEvalScenario {
  return { id: 's', intent: 'x', phase: 'execute', mode: 'canonical-execute', directory: dir };
}

describe('provisioned sandbox uses the fresh local dist (not a package, not stale)', () => {
  it('materializes the local built dist and a bin shim that execs it', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const dir = temporaryRoot('sandbox-');
    await provisionScenarioDirectories([scenario(dir)], {
      rootDirectory: temporaryRoot('sandbox-store-'),
      gennadyRoot: root,
    });
    const dist = readFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), 'utf8');
    assert.strictEqual(dist, '// BUILD V1\n');
    const shim = readFileSync(join(dir, 'node_modules/.bin/gennady'), 'utf8');
    assert.match(shim, /\.\.\/gennady\/dist\/gennady\.js/);
    assert.match(shim, /^#!/);
  });

  it('REFRESHES a stale sandbox dist on re-provision (no blanket skip)', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const dir = temporaryRoot('sandbox-');
    const storeRoot = temporaryRoot('sandbox-store-');
    await provisionScenarioDirectories([scenario(dir)], {
      rootDirectory: storeRoot,
      gennadyRoot: root,
    });
    // A stale prior build sits in the reused sandbox; the source build then advances.
    writeFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), '// STALE V0\n');
    writeFileSync(join(root, 'dist/gennady.js'), '// BUILD V2\n');
    await provisionScenarioDirectories([scenario(dir)], {
      rootDirectory: storeRoot,
      gennadyRoot: root,
    });
    const dist = readFileSync(join(dir, 'node_modules/gennady/dist/gennady.js'), 'utf8');
    assert.strictEqual(dist, '// BUILD V2\n');
  });

  it('shares one physical dependency store across generated scenarios through verified symlinks', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    const scenarios = await provisionScenarioDirectories(
      [
        {
          id: 'one',
          intent: 'x',
          fixture: 'fibonacci-library',
          phase: 'execute',
          mode: 'canonical-execute',
        },
        {
          id: 'two',
          intent: 'x',
          fixture: 'tic-tac-toe',
          phase: 'execute',
          mode: 'canonical-execute',
        },
      ],
      { rootDirectory: sandboxRoot, gennadyRoot: root }
    );
    const firstDependency = join(scenarios[0]?.directory ?? '', 'node_modules/jsdom');
    const secondDependency = join(scenarios[1]?.directory ?? '', 'node_modules/jsdom');
    assert.equal(lstatSync(firstDependency).isSymbolicLink(), true);
    assert.equal(lstatSync(secondDependency).isSymbolicLink(), true);
    assert.equal(realpathSync(firstDependency), realpathSync(join(root, 'node_modules/jsdom')));
    assert.equal(realpathSync(secondDependency), realpathSync(firstDependency));
    const stores = readdirSync(join(sandboxRoot, '.sdd-flow-eval-dependencies'));
    assert.equal(stores.length, 1, 'one content-addressed metadata store per lock contract');
  });

  it('fails closed on installed-lock mismatch before creating a scenario directory', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    const hiddenPath = join(root, 'node_modules/.package-lock.json');
    const hidden = JSON.parse(readFileSync(hiddenPath, 'utf8')) as {
      packages: Record<string, { version: string }>;
    };
    hidden.packages['node_modules/jsdom']!.version = '99.0.0';
    writeFileSync(hiddenPath, `${JSON.stringify(hidden)}\n`);
    await assert.rejects(
      provisionScenarioDirectories(
        [
          {
            id: 'mismatch',
            intent: 'x',
            fixture: 'fibonacci-library',
            phase: 'execute',
            mode: 'canonical-execute',
          },
        ],
        { rootDirectory: sandboxRoot, gennadyRoot: root }
      ),
      /dependency contract mismatch for jsdom/
    );
    assert.equal(
      readdirSync(sandboxRoot).some((name) => name.startsWith('sdd-flow-eval-')),
      false
    );
  });

  it('rejects an unowned dependency lease before creating a store or sandbox', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    await assert.rejects(
      provisionScenarioDirectories(
        [
          {
            id: 'orphan-lease',
            intent: 'x',
            fixture: 'fibonacci-library',
            phase: 'execute',
            mode: 'canonical-execute',
          },
        ],
        {
          rootDirectory: sandboxRoot,
          gennadyRoot: root,
          dependencyLeaseId: 'no-owner',
        }
      ),
      /dependencyLeaseId requires onDependencyLease/
    );
    assert.deepEqual(readdirSync(sandboxRoot), []);
  });

  it('fails closed when an existing content-addressed store has mismatched metadata', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    await provisionScenarioDirectories([scenario(temporaryRoot('sandbox-'))], {
      rootDirectory: sandboxRoot,
      gennadyRoot: root,
    });
    const storeRoot = join(sandboxRoot, '.sdd-flow-eval-dependencies');
    const [fingerprint] = readdirSync(storeRoot);
    assert.ok(fingerprint);
    const metadataPath = join(storeRoot, fingerprint, 'metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { platform: string };
    metadata.platform = 'tampered-platform';
    writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
    await assert.rejects(
      provisionScenarioDirectories([scenario(temporaryRoot('sandbox-'))], {
        rootDirectory: sandboxRoot,
        gennadyRoot: root,
      }),
      /dependency store metadata mismatch/
    );
  });

  it('removes every owned directory when a later scenario fails during setup', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    const created: string[] = [];
    await assert.rejects(
      provisionScenarioDirectories(
        [
          {
            id: 'valid',
            intent: 'x',
            fixture: 'fibonacci-library',
            phase: 'execute',
            mode: 'canonical-execute',
          },
          {
            id: 'broken',
            intent: 'x',
            fixture: 'not-a-fixture' as SddEvalScenario['fixture'],
            phase: 'execute',
            mode: 'canonical-execute',
          },
        ],
        {
          rootDirectory: sandboxRoot,
          gennadyRoot: root,
          onOwnedDirectory: (_scenarioId, directory) => created.push(directory),
        }
      ),
      /unknown SDD eval fixture/
    );
    assert.equal(created.length, 2);
    assert.ok(created.every((directory) => !existsSync(directory)));
  });

  it('cleans a just-created sandbox when ownership callback rejects the transfer', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    let offered = '';
    await assert.rejects(
      provisionScenarioDirectories(
        [
          {
            id: 'rejected-owner',
            intent: 'x',
            fixture: 'fibonacci-library',
            phase: 'execute',
            mode: 'canonical-execute',
          },
        ],
        {
          rootDirectory: sandboxRoot,
          gennadyRoot: root,
          lifecycleOwnsCleanup: true,
          onOwnedDirectory: (_scenarioId, directory) => {
            offered = directory;
            throw new Error('owner rejected path');
          },
        }
      ),
      /owner rejected path/
    );
    assert.ok(offered);
    assert.equal(existsSync(offered), false);
  });

  it('defers setup-failure cleanup so the outer lifecycle compacts partial evidence first', async () => {
    const root = fakeGennadyRoot('// BUILD V1\n');
    const sandboxRoot = temporaryRoot('sandbox-root-');
    const lifecycle = new SddEvalSandboxLifecycle({
      sandboxRoot,
      artifactsRoot: join(sandboxRoot, 'artifacts'),
      runId: 'run-setup-failure',
      keep: false,
    });
    await assert.rejects(
      provisionScenarioDirectories(
        [
          {
            id: 'partial',
            intent: 'x',
            fixture: 'fibonacci-library',
            phase: 'execute',
            mode: 'canonical-execute',
          },
          {
            id: 'broken',
            intent: 'x',
            fixture: 'not-a-fixture' as SddEvalScenario['fixture'],
            phase: 'execute',
            mode: 'canonical-execute',
          },
        ],
        {
          rootDirectory: sandboxRoot,
          gennadyRoot: root,
          dependencyLeaseId: 'run-setup-failure',
          lifecycleOwnsCleanup: true,
          onOwnedDirectory: (scenarioId, directory) => {
            lifecycle.registerOwnedDirectory(scenarioId, directory);
            if (scenarioId === 'partial')
              writeFileSync(join(directory, 'partial.spec.md'), '# partial\n');
          },
          onDependencyLease: (leaseFile) => lifecycle.registerDependencyLease(leaseFile),
        }
      ),
      /unknown SDD eval fixture/
    );
    assert.equal(lifecycle.ownedDirectories.length, 2);
    const finalized = await lifecycle.finalize('setup-failure');
    assert.equal(finalized.pending.length, 0);
    assert.equal(finalized.removed, 2);
    assert.ok(finalized.runDirectory);
    assert.equal(
      existsSync(join(finalized.runDirectory, 'partial', 'partial.spec.md')),
      true,
      'partial setup evidence survives before sandbox cleanup'
    );
  });
});
