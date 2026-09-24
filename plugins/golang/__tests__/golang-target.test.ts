// @file: UV-05 contract tests for Go target DAG, config, scope and readiness.
// @consumers: CI
// @spec: CLI-VERIFY

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_PLUGINS } from '../../index.ts';
import { VerifyConfigError } from '../../../shared/verify/config/verify-config.error.ts';
import { resolveGolangPreset } from '../../../shared/verify/presets/golang.ts';
import { golangPlugin } from '../golang-plugin.ts';
import { resolveGolangVerifyPlan } from '../golang-planner.ts';

const ZERO_YAML = path.resolve('plugins/golang/__tests__/fixtures/zero-yaml');

function executable(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(file, 0o755);
}

function withGoProject(
  run: (root: string) => void,
  options: {
    readonly tools?: readonly ('go' | 'gofmt' | 'golangci-lint')[];
    readonly yaml?: string;
    readonly makefile?: string;
  } = {}
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-target-'));
  const previousPath = process.env['PATH'];
  try {
    fs.cpSync(ZERO_YAML, root, { recursive: true });
    fs.mkdirSync(path.join(root, 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(root, 'pkg', 'owned.go'), 'package pkg\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
    for (const tool of options.tools ?? ['go', 'gofmt', 'golangci-lint']) {
      executable(path.join(root, 'bin', tool));
    }
    if (options.yaml !== undefined) fs.writeFileSync(path.join(root, 'gennady.yaml'), options.yaml);
    if (options.makefile !== undefined)
      fs.writeFileSync(path.join(root, 'Makefile'), options.makefile);
    process.env['PATH'] = '';
    run(root);
  } finally {
    if (previousPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = previousPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function resolve(root: string, phase: string) {
  return resolveGolangVerifyPlan(root, phase, {
    homeDirectory: root,
    targetFiles: ['pkg/owned.go'],
  });
}

describe('Go target StackPlugin', () => {
  it('is registered symmetrically while the legacy preset and receipts contract stay intact', () => {
    withGoProject((root) => {
      assert.strictEqual(
        BUILTIN_PLUGINS.find((plugin) => plugin.id === 'golang'),
        golangPlugin
      );
      assert.ok(golangPlugin.target);
      assert.deepStrictEqual(golangPlugin.gateIds, [
        'generate',
        'build',
        'vet',
        'fmt',
        'lint',
        'test',
      ]);
      assert.deepStrictEqual(resolveGolangPreset(root).gateNames('full', false), [
        'generate',
        'build',
        'vet',
        'fmt',
        'lint',
        'test',
      ]);
      assert.strictEqual(
        resolveGolangPreset(root).environmentStateSource,
        'shared/verify/presets/golang.ts#golangVerificationEnvironmentState'
      );
      assert.deepStrictEqual(
        golangPlugin.target?.createPreset(golangPlugin.detect(root)!).rules,
        []
      );
    });
  });

  it('uses one zero-YAML DAG for READY code and unit slices with direct argv', () => {
    withGoProject((root) => {
      const code = resolve(root, 'code');
      const unit = resolve(root, 'unit');
      assert.deepStrictEqual(
        code.plan.steps.map((step) => step.id),
        [
          'golang:generate',
          'golang:build',
          'golang:vet',
          'golang:lint-fix',
          'golang:lint',
          'golang:format-fix',
          'golang:fmt',
        ]
      );
      assert.deepStrictEqual(
        unit.plan.steps.map((step) => step.id),
        [...code.plan.steps.map((step) => step.id), 'golang:test']
      );
      assert.strictEqual(code.readiness.status, 'READY');
      assert.strictEqual(unit.readiness.status, 'READY');
      assert.ok(
        code.readiness.entries.some(
          (entry) => entry.requirementId === 'golang:generate:not-applicable'
        )
      );
      assert.ok(
        code.plan.steps
          .filter((step) => step.command !== undefined)
          .every((step) => Array.isArray(step.command?.argv))
      );
      assert.strictEqual(
        code.composed.provenance.get('verify.presets.golang.steps.build.command.argv'),
        'go-project:1 file(s) from 1 target(s)'
      );
    });
  });

  it('models drift and repairs honestly with exact gofmt targets and selective invalidation', () => {
    withGoProject((root) => {
      fs.writeFileSync(
        path.join(root, 'pkg', 'owned.go'),
        '//go:generate go run ./cmd/generate\npackage pkg\n'
      );
      const result = resolve(root, 'code');
      const generate = result.plan.steps.find((step) => step.id === 'golang:generate');
      const lintFix = result.plan.steps.find((step) => step.id === 'golang:lint-fix');
      const formatFix = result.plan.steps.find((step) => step.id === 'golang:format-fix');
      const lint = result.plan.steps.find((step) => step.id === 'golang:lint');
      const fmt = result.plan.steps.find((step) => step.id === 'golang:fmt');

      assert.strictEqual(generate?.effect, 'drift-signal');
      assert.strictEqual(generate?.writes, undefined);
      assert.deepStrictEqual(generate?.command?.argv.slice(1), ['generate', './pkg']);
      assert.strictEqual(lintFix?.effect, 'repair');
      assert.deepStrictEqual(lintFix?.writes?.include, ['pkg/*.go']);
      assert.deepStrictEqual(lintFix?.invalidates, [
        'golang:generate',
        'golang:build',
        'golang:vet',
      ]);
      assert.strictEqual(formatFix?.effect, 'repair');
      assert.deepStrictEqual(formatFix?.command?.argv.slice(-1), ['pkg/owned.go']);
      assert.deepStrictEqual(formatFix?.writes?.include, ['pkg/owned.go']);
      assert.deepStrictEqual(formatFix?.invalidates, [
        'golang:generate',
        'golang:build',
        'golang:vet',
        'golang:lint',
      ]);
      assert.deepStrictEqual(lint?.command?.argv.includes('--fix'), false);
      assert.deepStrictEqual(fmt?.command?.argv.slice(-2), ['-l', 'pkg/owned.go']);
    });
  });

  it('bounds lint repair writes to selected packages instead of unrelated Go packages', () => {
    withGoProject((root) => {
      fs.mkdirSync(path.join(root, 'unrelated'));
      fs.writeFileSync(path.join(root, 'unrelated', 'other.go'), 'package unrelated\n');
      const lintFix = resolve(root, 'code').plan.steps.find(
        (step) => step.id === 'golang:lint-fix'
      );
      assert.deepStrictEqual(lintFix?.writes?.include, ['pkg/*.go']);
      assert.ok(lintFix?.writes?.exclude.includes('.git/**'));
      assert.ok(!lintFix?.writes?.include.some((pattern) => pattern.includes('unrelated')));
    });
  });

  it('leaves project-owned integration and coverage commandless and blocks only selected slices', () => {
    withGoProject((root) => {
      assert.strictEqual(resolve(root, 'code').readiness.status, 'READY');
      assert.strictEqual(resolve(root, 'unit').readiness.status, 'READY');

      const integration = resolve(root, 'integration');
      assert.strictEqual(integration.readiness.status, 'BLOCKED');
      assert.strictEqual(
        integration.plan.steps.find((step) => step.id === 'golang:integration')?.command,
        undefined
      );
      assert.ok(
        integration.readiness.entries.some(
          (entry) =>
            entry.requirementId === 'golang:command:integration' && entry.status === 'BLOCKED'
        )
      );

      const coverage = resolve(root, 'coverage');
      assert.strictEqual(coverage.readiness.status, 'BLOCKED');
      assert.ok(
        coverage.readiness.entries.some(
          (entry) => entry.requirementId === 'golang:command:coverage' && entry.status === 'BLOCKED'
        )
      );
    });
  });

  it('accepts explicit read-only integration and coverage argv without inventing tags or thresholds', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'coverage');
        assert.strictEqual(result.readiness.status, 'READY');
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'golang:integration')?.command?.argv,
          ['go', 'test', './integration/...']
        );
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'golang:coverage')?.command?.argv,
          ['go', 'test', '-cover', './...']
        );
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              golang: {
                steps: {
                  integration: {
                    command: { argv: ['go', 'test', './integration/...'], cwd: '.' },
                  },
                  coverage: {
                    command: {
                      argv: ['go', 'test', '-cover', './...'],
                      cwd: '.',
                    },
                  },
                },
              },
            },
          },
        }),
      }
    );
  });

  it('fails selected tool and linter-config readiness closed with actionable fixes', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'code');
        const linter = result.readiness.entries.find(
          (entry) => entry.requirementId === 'golang:tool:golangci-lint:lint-fix'
        );
        assert.strictEqual(linter?.status, 'BLOCKED');
        assert.match(linter?.fix ?? '', /golangci-lint.*@<version/);
        assert.ok(
          result.readiness.entries.some(
            (entry) => entry.requirementId.includes('lint-config') && entry.status === 'BLOCKED'
          )
        );
      },
      {
        tools: ['go', 'gofmt'],
        makefile: 'lint:\n\tgolangci-lint run -c config/golangci-missing.yml ./...\n',
      }
    );
  });

  it('blocks missing Go/gofmt with version-aware installation guidance', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'unit');
        for (const requirementId of ['golang:tool:go:build', 'golang:tool:gofmt:format-fix']) {
          const entry = result.readiness.entries.find(
            (candidate) => candidate.requirementId === requirementId
          );
          assert.strictEqual(entry?.status, 'BLOCKED');
          assert.match(entry?.fix ?? '', /Go 1\.22/);
        }
      },
      { tools: ['golangci-lint'] }
    );
  });

  it('does not require a missing linter for explicitly waived lint steps', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'code');
        assert.strictEqual(result.readiness.status, 'DEGRADED');
        assert.ok(
          !result.readiness.entries.some((entry) =>
            entry.requirementId.startsWith('golang:tool:golangci-lint:')
          )
        );
        assert.strictEqual(
          result.readiness.entries.filter((entry) => entry.status === 'WAIVED').length,
          2
        );
      },
      {
        tools: ['go', 'gofmt'],
        yaml: JSON.stringify({
          verify: {
            presets: {
              golang: {
                steps: {
                  'lint-fix': { enabled: false, reason: 'project uses a remote linter' },
                  lint: { enabled: false, reason: 'project uses a remote linter' },
                },
              },
            },
          },
        }),
      }
    );
  });

  it('keeps unscoped exact gofmt repair BLOCKED instead of widening its write set', () => {
    withGoProject((root) => {
      const result = resolveGolangVerifyPlan(root, 'code', { homeDirectory: root });
      const repair = result.plan.steps.find((step) => step.id === 'golang:format-fix');
      const lintRepair = result.plan.steps.find((step) => step.id === 'golang:lint-fix');
      assert.strictEqual(repair?.command, undefined);
      assert.deepStrictEqual(lintRepair?.writes?.include, ['**/*.go']);
      assert.strictEqual(result.readiness.status, 'BLOCKED');
      assert.ok(
        result.readiness.entries.some(
          (entry) => entry.requirementId === 'golang:exact-targets:format-fix'
        )
      );
    });
  });

  it('omits direct repair commands when selected scope has no packages or exact Go files', () => {
    withGoProject(
      (root) => {
        const result = resolveGolangVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['README.md'],
        });
        assert.strictEqual(
          result.plan.steps.find((step) => step.id === 'golang:lint-fix')?.command,
          undefined
        );
        assert.strictEqual(
          result.plan.steps.find((step) => step.id === 'golang:format-fix')?.command,
          undefined
        );
        assert.strictEqual(result.readiness.status, 'BLOCKED');
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              golang: {
                steps: {
                  'lint-fix': {
                    command: { argv: ['golangci-lint', 'run', '--fix'], cwd: '.' },
                  },
                  'format-fix': { command: { argv: ['gofmt', '-w'], cwd: '.' } },
                },
              },
            },
          },
        }),
      }
    );
  });

  it('does not turn all-mode directories into exact gofmt repair operands', () => {
    withGoProject(
      (root) => {
        const result = resolveGolangVerifyPlan(root, 'code', { homeDirectory: root });
        assert.strictEqual(
          result.plan.steps.find((step) => step.id === 'golang:format-fix')?.command,
          undefined
        );
        assert.ok(
          result.readiness.entries.some(
            (entry) =>
              entry.requirementId === 'golang:exact-targets:format-fix' &&
              entry.status === 'BLOCKED'
          )
        );
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              golang: {
                steps: {
                  'format-fix': { command: { argv: ['gofmt', '-s', '-w'], cwd: '.' } },
                },
              },
            },
          },
        }),
      }
    );
  });

  it('uses personal config above project rc and yaml while preserving leaf provenance', () => {
    withGoProject((root) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'golang-target-home-'));
      try {
        const config = (value: string) =>
          JSON.stringify({
            verify: {
              presets: {
                golang: {
                  steps: { test: { command: { argv: ['go', 'test', value], cwd: '.' } } },
                },
              },
            },
          });
        fs.writeFileSync(path.join(root, 'gennady.yaml'), config('./yaml/...'));
        fs.writeFileSync(path.join(root, '.gennadyrc'), config('./project/...'));
        fs.writeFileSync(path.join(home, '.gennadyrc'), config('./personal/...'));
        const result = resolveGolangVerifyPlan(root, 'unit', {
          homeDirectory: home,
          targetFiles: ['pkg/owned.go'],
        });
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'golang:test')?.command?.argv,
          ['go', 'test', './personal/...']
        );
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.golang.steps.test.command.argv'),
          '~/.gennadyrc'
        );
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  });

  it('mirrors legacy fmt/lint skips to their target repair steps visibly', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'code');
        assert.deepStrictEqual(result.composed.waivers.map((waiver) => waiver.stepId).sort(), [
          'golang:fmt',
          'golang:format-fix',
          'golang:lint',
          'golang:lint-fix',
        ]);
        assert.strictEqual(result.readiness.status, 'DEGRADED');
      },
      {
        yaml: JSON.stringify({
          stack: { golang: { skipGates: ['fmt', 'lint'] } },
        }),
      }
    );
  });

  it('preserves a legacy lint argv as observe-only and visibly waives lint repair', () => {
    withGoProject(
      (root) => {
        const result = resolve(root, 'code');
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'golang:lint')?.command?.argv,
          ['custom-lint', 'check']
        );
        assert.ok(result.composed.waivers.some((waiver) => waiver.stepId === 'golang:lint-fix'));
        assert.strictEqual(result.readiness.status, 'DEGRADED');
      },
      {
        yaml: JSON.stringify({
          stack: {
            golang: { overrideGates: { lint: { argv: ['custom-lint', 'check'] } } },
          },
        }),
      }
    );
  });

  it('rejects a legacy fmt argv that cannot map to observe plus repair semantics', () => {
    withGoProject(
      (root) => {
        assert.throws(
          () => resolve(root, 'code'),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_LEGACY_UNSUPPORTED');
            assert.strictEqual(error.path, 'stack.golang.overrideGates.fmt.argv');
            assert.match(error.hint, /format-fix.*\.fmt/);
            return true;
          }
        );
      },
      {
        yaml: JSON.stringify({
          stack: { golang: { overrideGates: { fmt: { argv: ['gofmt', '-l', '.'] } } } },
        }),
      }
    );
  });

  it('rejects unsafe observe/repair argv and non-regular Target Files with typed paths', () => {
    const unsafe = [
      ['format-fix', ['gofmt', 'pkg', '-w']],
      ['format-fix', ['gofmt', '-r', '-w']],
      ['format-fix', ['gofmt', '-cpuprofile', '-w']],
      ['lint-fix', ['golangci-lint', 'run', './...', '--fix']],
      ['fmt', ['gofmt', '-w']],
      ['lint', ['golangci-lint', 'run', '--fix']],
    ] as const;
    for (const [stepId, argv] of unsafe) {
      withGoProject(
        (root) => {
          assert.throws(
            () => resolve(root, 'code'),
            (error: unknown) => {
              assert.ok(error instanceof VerifyConfigError);
              assert.strictEqual(error.path, `verify.presets.golang.steps.${stepId}.command.argv`);
              return true;
            }
          );
        },
        {
          yaml: JSON.stringify({
            verify: {
              presets: {
                golang: { steps: { [stepId]: { command: { argv, cwd: '.' } } } },
              },
            },
          }),
        }
      );
    }

    withGoProject((root) => {
      assert.throws(
        () =>
          resolveGolangVerifyPlan(root, 'code', {
            homeDirectory: root,
            targetFiles: ['pkg/missing.go'],
          }),
        (error: unknown) => {
          assert.ok(error instanceof VerifyConfigError);
          assert.strictEqual(error.path, 'scope.targetFiles[0]');
          return true;
        }
      );
      const outside = path.join(os.tmpdir(), `golang-target-outside-${process.pid}.go`);
      fs.writeFileSync(outside, 'package outside\n');
      fs.symlinkSync(outside, path.join(root, 'linked.go'));
      try {
        assert.throws(
          () =>
            resolveGolangVerifyPlan(root, 'code', {
              homeDirectory: root,
              targetFiles: ['linked.go'],
            }),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.path, 'scope.targetFiles[0]');
            return true;
          }
        );
      } finally {
        fs.rmSync(outside, { force: true });
      }
    });
  });
});
