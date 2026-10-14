// @file: Causal R2 baseline selection through the real registry, snapshot and rules facade.
// @consumers: CI
// @spec: CLI-RULES

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_RULE_SOURCES, loadBuiltinRuleRegistry } from '../builtin-rule-sources.ts';
import { classifyPhaseFacts } from '../phase-facts.ts';
import { createRuleSnapshot } from '../rule-snapshot.ts';
import { resolveSddRuleSnapshot } from '../sdd-rule-snapshot.ts';
import { cleanTestChildEnv } from '../../../cli/__tests__/tool-behavior/run-cli.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

function runRulesCommand(root: string, argv: readonly string[]) {
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
      join(ROOT, 'cli/gennady.ts'),
      ...argv,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...cleanTestChildEnv(process.env), HOME: join(root, '.home'), NODE_NO_WARNINGS: '1' },
      timeout: 20_000,
    }
  );
  return { exitCode: child.status, stdout: child.stdout, stderr: child.stderr };
}

function treeBytes(root: string, directory = ''): Record<string, string> {
  return Object.fromEntries(
    readdirSync(join(root, directory), { withFileTypes: true })
      .flatMap((entry): [string, string][] => {
        const file = join(directory, entry.name);
        return entry.isDirectory()
          ? [[`${file}/`, 'directory'], ...Object.entries(treeBytes(root, file))]
          : [
              [
                file,
                createHash('sha256')
                  .update(readFileSync(join(root, file)))
                  .digest('hex'),
              ],
            ];
      })
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function context(
  files: readonly string[],
  artifacts?: Parameters<typeof classifyPhaseFacts>[0]['artifacts']
) {
  const registry = loadBuiltinRuleRegistry(ROOT);
  const facts = classifyPhaseFacts({ targetFiles: files, plannedFiles: files, artifacts });
  const snapshot = createRuleSnapshot(registry, facts);
  return { registry, facts, snapshot, ids: snapshot.required.map(({ id }) => id).sort() };
}

describe('MAIN baseline rule carry', () => {
  it('exposes all four embedded sources through the complete registry', () => {
    const { registry } = context([]);
    assert.deepEqual(
      ['coding-baseline', 'go-rules', 'python-rules', 'testing-baseline'].map(
        (id) => registry.get(id)?.source
      ),
      [
        'ai/directives/coding/baseline-rules.xml',
        'ai/directives/coding/go-rules.xml',
        'ai/directives/coding/python-rules.xml',
        'ai/directives/testing/baseline-testing.xml',
      ]
    );
    assert.equal(registry.list().length, 18);
  });

  it('keeps Go production free of test rules and closes only the coding dependency', () => {
    const { ids, registry } = context(['src/main.go']);
    assert.deepEqual(ids, ['coding-baseline', 'go-rules']);
    assert.deepEqual(registry.get('go-rules')?.dependsOn, ['coding-baseline']);
  });

  it('classifies Python source, stubs and tests without inventing a Verify provider', () => {
    const { facts, ids } = context(['src/api.py', 'src/api.pyi', 'tests/test_api.py']);
    assert.deepEqual(
      facts.artifacts.map(({ languages }) => languages),
      [['python'], ['python'], ['python']]
    );
    assert.deepEqual(facts.providers, []);
    assert.deepEqual(ids, ['coding-baseline', 'python-rules', 'testing-baseline']);
  });

  it('keeps Python production framework-neutral rather than requiring pytest or a TS test layer', () => {
    const { ids, registry } = context(['src/api.py']);
    assert.deepEqual(ids, ['coding-baseline', 'python-rules']);
    assert.deepEqual(registry.get('python-rules')?.dependsOn, ['coding-baseline']);
    assert.deepEqual(registry.get('python-rules')?.when, [{ language: ['python'] }]);
  });

  it('selects a generic test baseline for Go and explicit foreign-language tests', () => {
    assert.deepEqual(context(['src/main_test.go']).ids, [
      'coding-baseline',
      'go-rules',
      'testing-baseline',
    ]);
    assert.deepEqual(
      context(
        ['checks/case.custom'],
        [{ path: 'checks/case.custom', languages: ['custom'], roles: ['test'] }]
      ).ids,
      ['testing-baseline']
    );
  });

  it('preserves strict TS production and runner-specific test-light semantics', () => {
    assert.deepEqual(context(['src/app.ts']).ids, ['coding-baseline', 'typescript-rules']);
    const { ids } = context(
      ['src/app.test.ts'],
      [
        {
          path: 'src/app.test.ts',
          languages: ['typescript'],
          roles: ['test'],
          frameworks: ['vitest'],
        },
      ]
    );
    assert.deepEqual(ids, [
      'coding-baseline',
      'testing-baseline',
      'testing-common',
      'vitest-rules',
    ]);
  });

  it('does not mistake markdown production role for source-language baseline eligibility', () => {
    const { ids, facts } = context(['README.md']);
    assert.deepEqual(facts.artifacts[0]?.roles, ['production']);
    assert.deepEqual(ids, []);
  });

  it('retains reasoned add/skip provenance and rejects skipped required coding dependencies', () => {
    const { registry, facts } = context(['src/main.go']);
    assert.throws(
      () =>
        createRuleSnapshot(registry, facts, [
          {
            action: 'skip',
            ruleId: 'coding-baseline',
            reason: 'reviewed exception',
            provenance: 'ticket#P1',
          },
        ]),
      /RULE_RESOLUTION_REQUIRED_DEPENDENCY_SKIPPED/
    );
    const added = createRuleSnapshot(registry, facts, [
      {
        action: 'add',
        ruleId: 'testing-baseline',
        reason: 'explicit test design',
        provenance: 'ticket#P1',
      },
    ]);
    assert.equal(added.required.find(({ id }) => id === 'testing-baseline')?.via, 'override');
    assert.equal(
      added.required.find(({ id }) => id === 'testing-baseline')?.provenance,
      'ticket#P1'
    );
    const skipped = createRuleSnapshot(registry, facts, [
      { action: 'skip', ruleId: 'go-rules', reason: 'reviewed exception', provenance: 'ticket#P1' },
    ]);
    assert.equal(skipped.skipped.find(({ id }) => id === 'go-rules')?.reason, 'reviewed exception');
  });

  it('projects real list/show/resolve and the same snapshot for arbitrary selector without writes', () => {
    // contract: an isolated project uses actual embedded prompts, not a fabricated registry or old Git ref.
    // #region START_CLI_SETUP_ISOLATED_PROJECT
    const root = mkdtempSync(join(tmpdir(), 'main-carry-rules-'));
    const files = ['src/api.py', 'tests/test_api.py'];
    for (const source of BUILTIN_RULE_SOURCES) {
      mkdirSync(dirname(join(root, source)), { recursive: true });
      copyFileSync(join(ROOT, source), join(root, source));
    }
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '# unchanged fixture\n');
    }
    // #endregion END_CLI_SETUP_ISOLATED_PROJECT
    try {
      const before = treeBytes(root);
      // #region START_CLI_ASSERT_REAL_PROJECTIONS
      const list = runRulesCommand(root, ['rules', 'list', '--format', 'json']);
      assert.equal(list.exitCode, 0, list.stderr);
      assert.equal(JSON.parse(list.stdout).rules.length, 18);
      for (const id of ['coding-baseline', 'go-rules', 'python-rules', 'testing-baseline']) {
        const shown = runRulesCommand(root, ['rules', 'show', id, '--format', 'json']);
        assert.equal(shown.exitCode, 0, shown.stderr);
        assert.match(JSON.parse(shown.stdout).rule.body, /<Axiom id="AX_/);
      }
      const run = (phase: string) =>
        runRulesCommand(root, [
          'rules',
          'resolve',
          '--phase',
          phase,
          '--files',
          ...files,
          '--format',
          'json',
        ]);
      const arbitrary = run('review-candidate-42');
      assert.equal(arbitrary.exitCode, 0, arbitrary.stderr);
      const report = JSON.parse(arbitrary.stdout);
      assert.deepEqual(report.selected.required.map(({ id }: { id: string }) => id).sort(), [
        'coding-baseline',
        'python-rules',
        'testing-baseline',
      ]);
      const dispatch = resolveSddRuleSnapshot({
        root,
        targetFiles: files,
        plannedFiles: files,
        intents: ['review-candidate-42'],
      });
      assert.equal(report.digest, dispatch.snapshot.digest);
      const coverage = run('coverage');
      assert.equal(coverage.exitCode, 0, coverage.stderr);
      assert.deepEqual(JSON.parse(coverage.stdout).selected, report.selected);
      assert.equal(run('review-candidate-42').stdout, arbitrary.stdout);
      assert.deepEqual(
        treeBytes(root),
        before,
        'CLI must not add/remove paths or change source/config bytes'
      );
      // #endregion END_CLI_ASSERT_REAL_PROJECTIONS
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
