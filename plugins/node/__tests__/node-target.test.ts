// @file: UV-04 contract tests for the Node target plugin, DAG slices, config and readiness.
// @consumers: CI
// @spec: CLI-VERIFY

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUILTIN_PLUGINS } from '../../index.ts';
import { resolvePreset } from '../../../shared/verify/presets/node.ts';
import { VerifyConfigError } from '../../../shared/verify/config/verify-config.error.ts';
import { nodePlugin } from '../node-plugin.ts';
import { resolveNodeVerifyPlan } from '../node-planner.ts';

const ZERO_YAML = path.resolve('plugins/node/__tests__/fixtures/zero-yaml');
const TARGETS = ['src/a.ts', 'src/b.ts'] as const;

function withProject(
  document: Record<string, unknown>,
  run: (root: string) => void,
  yaml?: string
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-target-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(document));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export const b = 2;\n');
    if (yaml !== undefined) fs.writeFileSync(path.join(root, 'gennady.yaml'), yaml);
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function stepIds(root: string, phase: string): readonly string[] {
  return resolveNodeVerifyPlan(root, phase, {
    homeDirectory: root,
    targetFiles: TARGETS,
  }).plan.steps.map((step) => step.id);
}

describe('Node target StackPlugin', () => {
  it('is registered symmetrically while the frozen legacy preset stays unchanged', () => {
    assert.strictEqual(
      BUILTIN_PLUGINS.find((plugin) => plugin.id === 'node'),
      nodePlugin
    );
    assert.ok(nodePlugin.target);
    assert.deepStrictEqual(nodePlugin.gateIds, []);
    assert.deepStrictEqual(nodePlugin.verify.planGates({} as never, {} as never, {} as never), []);
    assert.strictEqual(
      resolvePreset('node', 'full', ZERO_YAML)?.commandForGate(
        'type-check',
        { 'type-check': 'tsc --noEmit' },
        []
      ),
      'npm run type-check'
    );
    assert.deepStrictEqual(
      nodePlugin.target?.createPreset(nodePlugin.detect(ZERO_YAML)!).rules,
      []
    );
  });

  it('uses one zero-YAML DAG for code, unit and coverage slices', () => {
    assert.deepStrictEqual(stepIds(ZERO_YAML, 'code'), [
      'node:type-check',
      'node:lint-fix',
      'node:lint',
      'node:format-fix',
      'node:format',
    ]);
    assert.deepStrictEqual(stepIds(ZERO_YAML, 'unit'), [
      'node:type-check',
      'node:lint-fix',
      'node:lint',
      'node:format-fix',
      'node:format',
      'node:unit',
    ]);
    assert.deepStrictEqual(stepIds(ZERO_YAML, 'coverage'), [
      'node:type-check',
      'node:lint-fix',
      'node:lint',
      'node:format-fix',
      'node:format',
      'node:unit',
      'node:coverage',
    ]);
    for (const phase of ['code', 'unit', 'coverage']) {
      const result = resolveNodeVerifyPlan(ZERO_YAML, phase, {
        homeDirectory: ZERO_YAML,
        targetFiles: TARGETS,
      });
      assert.strictEqual(result.readiness.status, 'READY');
      assert.strictEqual(
        result.composed.provenance.get('verify.presets.node.steps.type-check.command.argv'),
        'default:npm+package.json#scripts.type-check'
      );
    }
  });

  it('blocks an unsupported explicit package manager instead of guessing its argv contract', () => {
    withProject(
      {
        packageManager: 'acme-pm@1.0.0',
        scripts: {
          'type-check': 'tsc --noEmit',
          'lint:fix': 'eslint --fix',
          lint: 'gennady lint shared',
          'format:fix': 'prettier --write',
          format: 'prettier --check .',
        },
      },
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['src/a.ts'],
        });
        assert.ok(
          result.readiness.entries.some(
            (entry) => entry.requirementId === 'node:package-manager' && entry.status === 'BLOCKED'
          )
        );
        assert.ok(result.plan.steps.every((step) => step.command === undefined));
      }
    );
  });

  it('keeps an unsupported package-manager npmScript override as commandless BLOCKED data', () => {
    withProject(
      {
        packageManager: 'acme-pm@1.0.0',
        scripts: {
          'check:types': 'tsc --noEmit',
          'lint:fix': 'eslint --fix',
          lint: 'gennady lint shared',
          'format:fix': 'prettier --write',
          format: 'prettier --check .',
        },
      },
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['src/a.ts'],
        });
        const typeCheck = result.plan.steps.find((step) => step.id === 'node:type-check');
        assert.strictEqual(typeCheck?.command, undefined);
        assert.ok(
          typeCheck?.requires.some((requirement) => requirement.id === 'node:script:check:types')
        );
        assert.strictEqual(result.readiness.status, 'BLOCKED');
      },
      'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          command: { npmScript: check:types }\n'
    );
  });

  it('does not require a package-manager adapter for a slice whose steps are all waived', () => {
    const disabled = Object.fromEntries(
      ['type-check', 'lint-fix', 'lint', 'format-fix', 'format'].map((step) => [
        step,
        { enabled: false, reason: `operator waived ${step}` },
      ])
    );
    withProject(
      { packageManager: 'acme-pm@1.0.0', scripts: {} },
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['src/a.ts'],
        });
        assert.strictEqual(
          result.readiness.entries.find((entry) => entry.requirementId === 'node:package-manager')
            ?.status,
          'READY'
        );
        assert.strictEqual(result.readiness.status, 'DEGRADED');
        assert.ok(
          result.readiness.entries
            .filter((entry) => entry.status === 'WAIVED')
            .every((entry) => entry.stepId !== undefined && entry.disposition === 'waived')
        );
      },
      JSON.stringify({ verify: { presets: { node: { steps: disabled } } } })
    );
  });

  it('declares repair effects, bounded writes and selective invalidation as preset data', () => {
    const result = resolveNodeVerifyPlan(ZERO_YAML, 'code', {
      homeDirectory: ZERO_YAML,
      targetFiles: TARGETS,
    });
    const lintFix = result.plan.steps.find((step) => step.id === 'node:lint-fix');
    const formatFix = result.plan.steps.find((step) => step.id === 'node:format-fix');

    assert.strictEqual(lintFix?.effect, 'repair');
    assert.deepStrictEqual(lintFix?.invalidates, ['node:type-check']);
    assert.deepStrictEqual(lintFix?.command?.argv.slice(-3), ['--', ...TARGETS]);
    assert.ok(lintFix?.writes?.include.some((glob) => glob.includes('ts')));
    assert.ok(lintFix?.writes?.exclude.includes('.git/**'));
    assert.ok(lintFix?.writes?.exclude.includes('node_modules/**'));
    assert.strictEqual(formatFix?.effect, 'repair');
    assert.deepStrictEqual(formatFix?.invalidates, ['node:type-check', 'node:lint']);
    assert.deepStrictEqual(formatFix?.command?.argv.slice(-3), ['--', ...TARGETS]);
  });

  it('normalizes, deduplicates and code-unit sorts exact Target Files before appending', () => {
    const result = resolveNodeVerifyPlan(ZERO_YAML, 'code', {
      homeDirectory: ZERO_YAML,
      targetFiles: ['src/b.ts', 'src/../src/a.ts', 'src/b.ts'],
    });
    const repairs = result.plan.steps.filter((step) => step.effect === 'repair');
    for (const step of repairs) {
      assert.deepStrictEqual(step.command?.argv.slice(-3), ['--', 'src/a.ts', 'src/b.ts']);
    }
  });

  it('rejects non-exact or escaping Target Files with a typed scope path', () => {
    for (const invalid of [
      '../escape.ts',
      '/tmp/absolute.ts',
      'src/*.ts',
      '.',
      'src/',
      'src\\a.ts',
      'src/missing.ts',
      '',
    ]) {
      assert.throws(
        () =>
          resolveNodeVerifyPlan(ZERO_YAML, 'code', {
            homeDirectory: ZERO_YAML,
            targetFiles: [invalid],
          }),
        (error: unknown) => {
          assert.ok(error instanceof VerifyConfigError);
          assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_TYPE');
          assert.strictEqual(error.path, 'scope.targetFiles[0]');
          return true;
        }
      );
    }
  });

  it('rejects regular and dangling Target File symlinks', () => {
    const outside = path.join(os.tmpdir(), `node-target-outside-${process.pid}.ts`);
    fs.writeFileSync(outside, 'export {};\n');
    try {
      withProject({ scripts: {} }, (root) => {
        fs.symlinkSync(outside, path.join(root, 'linked.ts'));
        fs.symlinkSync(`${outside}.missing`, path.join(root, 'dangling.ts'));
        for (const target of ['linked.ts', 'dangling.ts']) {
          assert.throws(
            () =>
              resolveNodeVerifyPlan(root, 'code', {
                homeDirectory: root,
                targetFiles: [target],
              }),
            (error: unknown) => {
              assert.ok(error instanceof VerifyConfigError);
              assert.strictEqual(error.path, 'scope.targetFiles[0]');
              return true;
            }
          );
        }
      });
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('blocks an unscoped repair prefix instead of reporting a false READY', () => {
    const result = resolveNodeVerifyPlan(ZERO_YAML, 'code', { homeDirectory: ZERO_YAML });
    assert.strictEqual(result.readiness.status, 'BLOCKED');
    assert.ok(
      result.readiness.entries.some(
        (entry) => entry.status === 'BLOCKED' && entry.requirementId.includes('repair-scope')
      )
    );
    assert.ok(
      result.plan.steps
        .filter((step) => step.effect === 'repair')
        .every((step) => !step.command?.argv.includes('--'))
    );
  });

  it('blocks only integration/full when test:integration is absent', () => {
    const unit = resolveNodeVerifyPlan(ZERO_YAML, 'unit', {
      homeDirectory: ZERO_YAML,
      targetFiles: TARGETS,
    });
    const integration = resolveNodeVerifyPlan(ZERO_YAML, 'integration', {
      homeDirectory: ZERO_YAML,
      targetFiles: TARGETS,
    });
    const full = resolveNodeVerifyPlan(ZERO_YAML, 'full', {
      homeDirectory: ZERO_YAML,
      targetFiles: TARGETS,
    });
    assert.strictEqual(unit.readiness.status, 'READY');
    assert.strictEqual(integration.readiness.status, 'BLOCKED');
    assert.strictEqual(full.readiness.status, 'BLOCKED');
    assert.ok(
      integration.readiness.entries.some(
        (entry) =>
          entry.status === 'BLOCKED' && entry.requirementId === 'node:script:test:integration'
      )
    );
  });

  it('materializes npmScript through package-manager facts and keeps file provenance', () => {
    withProject(
      {
        packageManager: 'pnpm@10.0.0',
        scripts: {
          'check:types': 'tsc --noEmit',
          'lint:fix': 'eslint --fix',
          lint: 'gennady lint shared',
          'format:fix': 'prettier --write',
          format: 'prettier --check .',
          test: 'node --test',
          'test:coverage': 'node --test --experimental-test-coverage',
        },
      },
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['src/a.ts'],
        });
        const typeCheck = result.plan.steps.find((step) => step.id === 'node:type-check');
        assert.deepStrictEqual(typeCheck?.command?.argv, ['pnpm', 'run', 'check:types']);
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.node.steps.type-check.command.argv'),
          'gennady.yaml'
        );
        assert.strictEqual(result.readiness.status, 'READY');
      },
      [
        'verify:',
        '  presets:',
        '    node:',
        '      steps:',
        '        type-check:',
        '          command: { npmScript: check:types }',
        '',
      ].join('\n')
    );
  });

  it('materializes yarn and bun scripts through their explicit argv adapters', () => {
    for (const manager of ['yarn', 'bun'] as const) {
      withProject(
        {
          packageManager: `${manager}@1.0.0`,
          scripts: {
            'type-check': 'tsc --noEmit',
            'lint:fix': 'eslint --fix',
            lint: 'gennady lint shared',
            'format:fix': 'prettier --write',
            format: 'prettier --check .',
          },
        },
        (root) => {
          const result = resolveNodeVerifyPlan(root, 'code', {
            homeDirectory: root,
            targetFiles: ['src/a.ts'],
          });
          assert.deepStrictEqual(
            result.plan.steps.find((step) => step.id === 'node:type-check')?.command?.argv,
            [manager, 'run', 'type-check']
          );
          assert.strictEqual(result.readiness.status, 'READY');
        }
      );
    }
  });

  it('turns a missing explicit npmScript into actionable BLOCKED readiness', () => {
    withProject(
      {
        scripts: {
          'lint:fix': 'eslint --fix',
          lint: 'gennady lint shared',
          'format:fix': 'prettier --write',
          format: 'prettier --check .',
          test: 'node --test',
        },
      },
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: ['src/a.ts'],
        });
        const missing = result.readiness.entries.find(
          (entry) => entry.requirementId === 'node:script:check:types'
        );
        assert.strictEqual(missing?.status, 'BLOCKED');
        assert.match(missing?.fix ?? '', /check:types.*package\.json|package\.json.*check:types/);
      },
      'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          command: { npmScript: check:types }\n'
    );
  });

  it('lets explicit argv replace package-script readiness without guessing a script', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    delete document.scripts['test:coverage'];
    withProject(
      document,
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'coverage', {
          homeDirectory: root,
          targetFiles: TARGETS,
        });
        const coverage = result.plan.steps.find((step) => step.id === 'node:coverage');
        assert.deepStrictEqual(coverage?.command?.argv, ['node', 'scripts/coverage.mjs']);
        assert.ok(
          !result.readiness.entries.some(
            (entry) => entry.requirementId === 'node:script:test:coverage'
          )
        );
        assert.strictEqual(result.readiness.status, 'READY');
      },
      'verify:\n  presets:\n    node:\n      steps:\n        coverage:\n          command:\n            argv: [node, scripts/coverage.mjs]\n            cwd: .\n'
    );
  });

  it('materializes explicit repair argv as a Target Files prefix, never a whole-repo command', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    delete document.scripts['lint:fix'];
    withProject(
      document,
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: TARGETS,
        });
        const lintFix = result.plan.steps.find((step) => step.id === 'node:lint-fix');
        assert.deepStrictEqual(lintFix?.command?.argv, ['eslint', '--fix', '--', ...TARGETS]);
        assert.ok(
          !result.readiness.entries.some((entry) => entry.requirementId === 'node:script:lint:fix')
        );
        assert.strictEqual(result.readiness.status, 'READY');
      },
      'verify:\n  presets:\n    node:\n      steps:\n        lint-fix:\n          command:\n            argv: [eslint, --fix]\n            cwd: .\n'
    );
  });

  it('accepts the target-free Gennady repair form used by this repository', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    document.scripts['lint:fix'] = 'tsx cli/gennady.ts lint --autofix';
    withProject(document, (root) => {
      const result = resolveNodeVerifyPlan(root, 'code', {
        homeDirectory: root,
        targetFiles: TARGETS,
      });
      const lintFix = result.plan.steps.find((step) => step.id === 'node:lint-fix');
      assert.deepStrictEqual(lintFix?.command?.argv, ['npm', 'run', 'lint:fix', '--', ...TARGETS]);
      assert.strictEqual(result.readiness.status, 'READY');
    });
  });

  it('accepts proven read-only direct lint and format commands', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    delete document.scripts.lint;
    delete document.scripts.format;
    withProject(
      document,
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'code', {
          homeDirectory: root,
          targetFiles: TARGETS,
        });
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'node:lint')?.command?.argv,
          ['gennady', 'lint', 'shared']
        );
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'node:format')?.command?.argv,
          ['prettier', '--check', '.']
        );
        assert.strictEqual(result.readiness.status, 'READY');
      },
      JSON.stringify({
        verify: {
          presets: {
            node: {
              steps: {
                lint: { command: { argv: ['gennady', 'lint', 'shared'], cwd: '.' } },
                format: { command: { argv: ['prettier', '--check', '.'], cwd: '.' } },
              },
            },
          },
        },
      })
    );
  });

  it('rejects unsafe direct lint, format and repair argv with typed actionable errors', () => {
    const cases = [
      ['lint-fix', ['eslint', '.', '--fix']],
      ['lint-fix', ['eslint', 'src', '--fix']],
      ['lint-fix', ['eslint', 'foo.ts', '--fix']],
      ['lint', ['eslint', '--max-warnings=0']],
      ['lint', ['gennady', 'fix']],
      ['lint', ['gennady', 'lint', '--autofix']],
      ['format', ['prettier', '--write']],
      ['format', ['node', 'scripts/format.mjs']],
    ] as const;
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8'));
    for (const [step, argv] of cases) {
      withProject(
        document,
        (root) => {
          assert.throws(
            () =>
              resolveNodeVerifyPlan(root, 'code', {
                homeDirectory: root,
                targetFiles: ['src/a.ts'],
              }),
            (error: unknown) => {
              assert.ok(error instanceof VerifyConfigError);
              assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_TYPE');
              assert.strictEqual(error.path, `verify.presets.node.steps.${step}.command.argv`);
              assert.ok(error.hint.length > 0);
              return true;
            }
          );
        },
        JSON.stringify({
          verify: { presets: { node: { steps: { [step]: { command: { argv, cwd: '.' } } } } } },
        })
      );
    }
  });

  it('keeps an unsafe package repair command non-runnable and BLOCKED', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    document.scripts['lint:fix'] = 'eslint src --fix';
    withProject(document, (root) => {
      const result = resolveNodeVerifyPlan(root, 'code', {
        homeDirectory: root,
        targetFiles: ['src/a.ts'],
      });
      assert.strictEqual(
        result.plan.steps.find((step) => step.id === 'node:lint-fix')?.command,
        undefined
      );
      assert.ok(
        result.readiness.entries.some(
          (entry) =>
            entry.requirementId === 'node:repair-prefix:lint:fix' && entry.status === 'BLOCKED'
        )
      );
      assert.strictEqual(result.readiness.status, 'BLOCKED');
    });
  });

  it('connects the legacy adapter without changing the legacy runtime', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8'));
    withProject(
      document,
      (root) => {
        const result = resolveNodeVerifyPlan(root, 'unit', {
          homeDirectory: root,
          targetFiles: TARGETS,
        });
        const unit = result.plan.steps.find((step) => step.id === 'node:unit');
        assert.deepStrictEqual(unit?.command?.argv, ['node', 'custom-unit.mjs']);
        assert.ok(result.composed.migrationDiagnostics.length > 0);
        assert.ok(
          !result.readiness.entries.some((entry) => entry.requirementId === 'node:script:test')
        );
      },
      'stack:\n  node:\n    overrideGates:\n      unit:\n        argv: [node, custom-unit.mjs]\n'
    );
  });

  it('loads legacy compatibility only from the planner-provided home directory', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8'));
    withProject(document, (root) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'node-target-home-'));
      try {
        fs.writeFileSync(
          path.join(home, '.gennadyrc'),
          JSON.stringify({
            stack: {
              node: { overrideGates: { unit: { argv: ['node', 'home-unit.mjs'] } } },
            },
          })
        );
        const result = resolveNodeVerifyPlan(root, 'unit', {
          homeDirectory: home,
          targetFiles: TARGETS,
        });
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'node:unit')?.command?.argv,
          ['node', 'home-unit.mjs']
        );
        assert.ok(
          result.composed.migrationDiagnostics.some((entry) => entry.source === '~/.gennadyrc')
        );
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  });

  it('rejects a legacy repair override with baked operands before target append', () => {
    const document = JSON.parse(fs.readFileSync(path.join(ZERO_YAML, 'package.json'), 'utf8'));
    withProject(
      document,
      (root) => {
        assert.throws(
          () =>
            resolveNodeVerifyPlan(root, 'code', {
              homeDirectory: root,
              targetFiles: ['src/a.ts'],
            }),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_LEGACY_UNSUPPORTED');
            assert.match(error.message, /target-free repair prefix/);
            return true;
          }
        );
      },
      'stack:\n  node:\n    overrideGates:\n      lint-fix:\n        argv: [eslint, src, --fix]\n'
    );
  });

  it('rejects ambiguous npmScript plus argv with a typed actionable error', () => {
    withProject(
      { scripts: { 'type-check': 'tsc --noEmit' } },
      (root) => {
        assert.throws(
          () =>
            resolveNodeVerifyPlan(root, 'code', {
              homeDirectory: root,
              targetFiles: ['src/a.ts'],
            }),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_TYPE');
            assert.match(error.hint, /npmScript.*argv/);
            return true;
          }
        );
      },
      'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          command:\n            npmScript: type-check\n            argv: [npm, run, other]\n'
    );
  });
});
