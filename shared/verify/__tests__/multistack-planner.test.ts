// @file: UV-07 contract tests for scope-aware target multistack orchestration.
// @consumers: CI
// @spec: CLI-VERIFY

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { VerifyConfigError } from '../config/verify-config.error.ts';
import { resolveMultistackVerifyPlan } from '../planning/resolve-multistack.ts';

function executable(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(file, 0o755);
}

function withRepo(
  run: (root: string, home: string) => void,
  options: {
    readonly yaml?: string;
    readonly tools?: readonly string[];
    readonly markers?: 'all' | 'node-go' | 'none';
  } = {}
): void {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-multistack-'));
  const root = path.join(top, 'repo');
  const home = path.join(top, 'home');
  const bin = path.join(top, 'bin');
  const previousPath = process.env['PATH'];
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(home);
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'pkg'));
    fs.mkdirSync(path.join(root, 'Sources'));
    fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const app = 1;\n');
    fs.writeFileSync(path.join(root, 'pkg', 'app.go'), 'package pkg\n');
    fs.writeFileSync(path.join(root, 'Sources', 'App.swift'), 'print("hello")\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# repo\n');
    fs.writeFileSync(path.join(root, 'main.exotic'), 'opaque\n');
    if ((options.markers ?? 'all') !== 'none') {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'type-check': 'tsc --noEmit',
            'lint:fix': 'eslint --fix',
            lint: 'gennady lint src',
            'format:fix': 'prettier --write',
            format: 'prettier --check src',
            unit: 'node --test',
          },
        })
      );
      fs.writeFileSync(path.join(root, 'go.mod'), 'module example.com/multi\n\ngo 1.22\n');
    }
    if ((options.markers ?? 'all') === 'all') {
      fs.writeFileSync(path.join(root, 'Package.swift'), '// swift-tools-version: 6.0\n');
    }
    for (const tool of options.tools ?? [
      'go',
      'gofmt',
      'golangci-lint',
      'swift',
      'swiftformat',
      'swiftlint',
    ]) {
      executable(path.join(bin, tool));
      if (tool === 'go' || tool === 'gofmt' || tool === 'golangci-lint') {
        executable(path.join(root, 'bin', tool));
      }
    }
    const which = path.join(bin, 'which');
    fs.writeFileSync(
      which,
      '#!/bin/sh\ncandidate="${0%/*}/$1"\n[ -x "$candidate" ] && printf "%s\\n" "$candidate"\n'
    );
    fs.chmodSync(which, 0o755);
    if (options.yaml !== undefined) fs.writeFileSync(path.join(root, 'gennady.yaml'), options.yaml);
    process.env['PATH'] = bin;
    run(root, home);
  } finally {
    if (previousPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = previousPath;
    fs.rmSync(top, { recursive: true, force: true });
  }
}

function resolve(
  root: string,
  homeDirectory: string,
  files: readonly string[],
  mode: 'files' | 'changed' | 'all' = 'files',
  changedFrom?: string
) {
  return resolveMultistackVerifyPlan(root, 'code', {
    homeDirectory,
    scope: { mode, files, ...(changedFrom === undefined ? {} : { changedFrom }) },
  });
}

describe('scope-aware multistack target planner', () => {
  it('seeds only the stack owning the selected file and never emits an unaffected tail', () => {
    withRepo((root, home) => {
      const result = resolve(root, home, ['src/app.ts']);

      assert.deepStrictEqual(
        result.stacks.map(({ plugin, participation }) => [plugin, participation]),
        [
          ['swift', 'unaffected'],
          ['golang', 'unaffected'],
          ['node', 'affected'],
        ]
      );
      assert.ok(result.plan.steps.length > 0);
      assert.ok(result.plan.steps.every((step) => step.plugin === 'node'));
      assert.ok(result.readiness.entries.every((entry) => entry.plugin === 'node'));
      assert.deepStrictEqual(
        result.plan.steps.find((step) => step.id === 'node:lint-fix')?.command?.argv.slice(-2),
        ['--', 'src/app.ts']
      );
    });
  });

  it('treats empty targets as conservative all-scope, never a vacuous pass', () => {
    withRepo((root, home) => {
      const result = resolve(root, home, []);

      assert.deepStrictEqual(
        result.stacks.map(({ plugin, participation, blocking }) => [
          plugin,
          participation,
          blocking,
        ]),
        [
          ['swift', 'affected', true],
          ['golang', 'affected', true],
          ['node', 'affected', true],
        ]
      );
      assert.ok(new Set(result.plan.steps.map((step) => step.plugin)).size === 3);
    });
  });

  it('makes a root verify config path affect every selected detected stack', () => {
    withRepo(
      (root, home) => {
        fs.writeFileSync(path.join(root, '.gennadyrc'), '{"verify":{"presets":{}}}\n');
        for (const configPath of ['gennady.yaml', '.gennadyrc']) {
          const result = resolve(root, home, [configPath]);
          assert.ok(result.stacks.every((stack) => stack.participation === 'affected'));
          assert.deepStrictEqual(
            [...new Set(result.plan.steps.map((step) => step.plugin))].sort(),
            ['golang', 'node', 'swift']
          );
        }
      },
      { yaml: 'verify:\n  presets: {}\n' }
    );
  });

  it('lets every affected stack block instead of restoring the D-64 tail', () => {
    withRepo(
      (root, home) => {
        const result = resolve(root, home, ['src/app.ts', 'pkg/app.go']);
        assert.strictEqual(result.readiness.status, 'BLOCKED');
        assert.ok(
          result.readiness.entries.some(
            (entry) =>
              entry.plugin === 'golang' && entry.status === 'BLOCKED' && entry.blocking === true
          )
        );
        assert.strictEqual(
          result.stacks.find((stack) => stack.plugin === 'golang')?.blocking,
          true
        );
      },
      { tools: ['swift', 'swiftformat', 'swiftlint'] }
    );
  });

  it('allows only explicit reasoned non-blocking policy and keeps it visible with provenance', () => {
    withRepo(
      (root, home) => {
        const result = resolve(root, home, ['src/app.ts', 'pkg/app.go']);
        const golang = result.stacks.find((stack) => stack.plugin === 'golang');
        assert.deepStrictEqual(
          golang && {
            blocking: golang.blocking,
            reason: golang.policyReason,
            source: golang.policySource,
          },
          {
            blocking: false,
            reason: 'generated SDK is advisory during migration',
            source: 'gennady.yaml',
          }
        );
        assert.strictEqual(result.readiness.status, 'DEGRADED');
        assert.ok(
          result.readiness.entries.some(
            (entry) =>
              entry.plugin === 'golang' &&
              entry.blocking === false &&
              entry.policyReason === 'generated SDK is advisory during migration' &&
              entry.policySource === 'gennady.yaml'
          )
        );
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.golang.blocking'),
          'gennady.yaml'
        );
      },
      {
        tools: ['swift', 'swiftformat', 'swiftlint'],
        yaml: [
          'verify:',
          '  presets:',
          '    golang:',
          '      blocking: false',
          '      reason: generated SDK is advisory during migration',
          '',
        ].join('\n'),
      }
    );
  });

  it('rejects non-blocking policy without a non-empty reason', () => {
    withRepo(
      (root, home) => {
        assert.throws(
          () => resolve(root, home, ['pkg/app.go']),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_DISABLE_REASON_REQUIRED');
            assert.strictEqual(error.path, 'verify.presets.golang.reason');
            return true;
          }
        );
      },
      {
        yaml: 'verify:\n  presets:\n    golang:\n      blocking: false\n',
      }
    );
  });

  it('keeps distinct winning provenance for blocking and its inherited reason', () => {
    withRepo(
      (root, home) => {
        fs.writeFileSync(
          path.join(root, '.gennadyrc'),
          '{"verify":{"presets":{"golang":{"blocking":false}}}}\n'
        );
        const result = resolve(root, home, ['pkg/app.go']);
        const golang = result.stacks.find((stack) => stack.plugin === 'golang');
        assert.strictEqual(golang?.policySource, '.gennadyrc');
        assert.strictEqual(golang?.policyReasonSource, 'gennady.yaml');
        assert.ok(
          result.readiness.entries.some(
            (entry) =>
              entry.plugin === 'golang' &&
              entry.policySource === '.gennadyrc' &&
              entry.policyReasonSource === 'gennady.yaml'
          )
        );
      },
      {
        yaml: [
          'verify:',
          '  presets:',
          '    golang:',
          '      blocking: false',
          '      reason: inherited explanation',
          '',
        ].join('\n'),
      }
    );
  });

  it('uses stack.use only as detected intersection and preserves its ordering', () => {
    withRepo(
      (root, home) => {
        const result = resolve(root, home, ['src/app.ts', 'pkg/app.go']);
        assert.deepStrictEqual(
          result.stacks.map((stack) => stack.plugin),
          ['node', 'golang']
        );
        assert.ok(!result.stacks.some((stack) => stack.plugin === 'swift'));
      },
      {
        markers: 'node-go',
        yaml: 'stack:\n  use: [node, swift, golang]\n',
      }
    );
  });

  it('does not smuggle anystack back when stack.use excludes every owner', () => {
    withRepo(
      (root, home) => {
        assert.throws(
          () => resolve(root, home, ['main.exotic']),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_PLAN');
            assert.strictEqual(error.path, 'scope.files');
            return true;
          }
        );
      },
      { markers: 'node-go', yaml: 'stack:\n  use: [node]\n' }
    );
  });

  it('keeps one composed DAG so an explicit cross-plugin dependency pulls closure', () => {
    withRepo(
      (root, home) => {
        const result = resolve(root, home, ['src/app.ts']);
        assert.strictEqual(
          result.stacks.find((stack) => stack.plugin === 'golang')?.participation,
          'dependency'
        );
        assert.deepStrictEqual(
          result.plan.steps.slice(0, 4).map((step) => step.id),
          ['golang:generate', 'golang:build', 'golang:vet', 'node:type-check']
        );
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'golang:vet')?.command?.argv,
          [path.join(root, 'bin', 'go'), 'vet', './...']
        );
      },
      {
        yaml: [
          'verify:',
          '  presets:',
          '    node:',
          '      steps:',
          '        type-check:',
          '          needs: [golang:vet]',
          '',
        ].join('\n'),
      }
    );
  });

  it('routes an unowned target to a visible blocked anystack instead of a zero-step pass', () => {
    withRepo((root, home) => {
      const result = resolve(root, home, ['main.exotic']);
      assert.deepStrictEqual(
        result.stacks.map(({ plugin, participation }) => [plugin, participation]),
        [
          ['swift', 'unaffected'],
          ['golang', 'unaffected'],
          ['node', 'unaffected'],
          ['anystack', 'affected'],
        ]
      );
      assert.deepStrictEqual(result.plan.steps, []);
      assert.strictEqual(result.readiness.status, 'BLOCKED');
      assert.ok(
        result.readiness.entries.some(
          (entry) => entry.requirementId === 'anystack:declarative-steps'
        )
      );
    });
  });

  it('is deterministic across repeated planning regardless of registry/map insertion concerns', () => {
    withRepo((root, home) => {
      const first = resolve(root, home, ['src/app.ts', 'pkg/app.go', 'Sources/App.swift']);
      const second = resolve(root, home, [
        'Sources/App.swift',
        'pkg/app.go',
        'src/app.ts',
        'src/app.ts',
      ]);
      assert.deepStrictEqual(
        first.stacks.map((stack) => stack.plugin),
        second.stacks.map((stack) => stack.plugin)
      );
      assert.deepStrictEqual(
        first.plan.steps.map((step) => step.id),
        second.plan.steps.map((step) => step.id)
      );
      assert.deepStrictEqual([...first.composed.provenance], [...second.composed.provenance]);
    });
  });

  it('canonicalizes deleted-file paths before scope ownership and reporting', () => {
    withRepo((root, home) => {
      const result = resolve(
        root,
        home,
        ['src/../deleted.ts', 'deleted.ts'],
        'changed',
        'origin/main'
      );
      assert.deepStrictEqual(result.scope.files, ['deleted.ts']);
      assert.strictEqual(result.scope.changedFrom, 'origin/main');
      assert.strictEqual(
        result.stacks.find((stack) => stack.plugin === 'node')?.participation,
        'affected'
      );
    });
  });

  it('requires and preserves exact changed-base identity as part of deterministic scope', () => {
    withRepo((root, home) => {
      for (const invalid of [
        undefined,
        '',
        ' origin/main',
        'origin/main\n',
        'main..other',
        'HEAD~1',
      ]) {
        assert.throws(
          () => resolve(root, home, ['src/app.ts'], 'changed', invalid),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.path, 'scope.changedFrom');
            return true;
          }
        );
      }

      const main = resolve(root, home, ['src/app.ts'], 'changed', 'origin/main');
      const release = resolve(root, home, ['src/app.ts'], 'changed', 'release/v2');
      assert.deepStrictEqual(main.scope, {
        mode: 'changed',
        files: ['src/app.ts'],
        changedFrom: 'origin/main',
      });
      assert.deepStrictEqual(release.scope, {
        mode: 'changed',
        files: ['src/app.ts'],
        changedFrom: 'release/v2',
      });
      assert.notDeepStrictEqual(main.scope, release.scope);
      assert.deepStrictEqual(
        main.plan.steps.map((step) => step.id),
        release.plan.steps.map((step) => step.id)
      );

      const empty = resolve(root, home, [], 'changed', 'origin/main');
      assert.deepStrictEqual(empty.scope, {
        mode: 'changed',
        files: [],
        changedFrom: 'origin/main',
      });
      assert.ok(empty.stacks.every((stack) => stack.participation === 'affected'));
      const replay = resolveMultistackVerifyPlan(root, 'code', {
        homeDirectory: home,
        scope: empty.scope,
      });
      assert.deepStrictEqual(replay.scope, empty.scope);
      assert.deepStrictEqual(
        replay.plan.steps.map((step) => step.id),
        empty.plan.steps.map((step) => step.id)
      );
      assert.deepStrictEqual(replay.stacks, empty.stacks);

      const files = resolve(root, home, [], 'files');
      assert.deepStrictEqual(files.scope, { mode: 'files', files: [] });
      assert.ok(files.stacks.every((stack) => stack.participation === 'affected'));
    });
  });
});
