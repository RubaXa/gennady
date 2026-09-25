// @file: UV-06 contract tests for Swift target DAG, identity, config and readiness.
// @consumers: CI
// @spec: CLI-VERIFY

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BUILTIN_PLUGINS } from '../../index.ts';
import { VerifyConfigError } from '../../../shared/verify/config/verify-config.error.ts';
import { compileEnvFailRules } from '../../../shared/verify/env-fail.ts';
import { resolveSwiftPreset } from '../../../shared/verify/presets/swift.ts';
import { swiftPlugin } from '../swift-plugin.ts';
import { planSwiftGates } from '../swift-plan.logic.ts';
import { resolveSwiftVerifyPlan } from '../swift-planner.ts';

const ZERO_YAML = path.resolve('plugins/swift/__tests__/fixtures/zero-yaml');
const TARGET = 'Sources/ZeroYaml/main.swift';

function executable(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(file, 0o755);
}

function withSwiftProject(
  files: Readonly<Record<string, string>>,
  run: (root: string, home: string) => void,
  options: {
    readonly tools?: readonly ('swift' | 'swiftformat' | 'swiftlint' | 'xcodebuild')[];
    readonly yaml?: string;
    readonly personal?: string;
  } = {}
): void {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-target-'));
  const root = path.join(top, 'repo');
  const home = path.join(top, 'home');
  const bin = path.join(top, 'bin');
  const previousPath = process.env['PATH'];
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(home);
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    for (const tool of options.tools ?? ['swift', 'swiftformat', 'swiftlint', 'xcodebuild']) {
      executable(path.join(bin, tool));
    }
    const which = path.join(bin, 'which');
    fs.writeFileSync(
      which,
      '#!/bin/sh\ncandidate="${0%/*}/$1"\n[ -x "$candidate" ] && printf "%s\\n" "$candidate"\n'
    );
    fs.chmodSync(which, 0o755);
    if (options.yaml !== undefined) fs.writeFileSync(path.join(root, 'gennady.yaml'), options.yaml);
    if (options.personal !== undefined)
      fs.writeFileSync(path.join(home, '.gennadyrc'), options.personal);
    process.env['PATH'] = bin;
    run(root, home);
  } finally {
    if (previousPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = previousPath;
    fs.rmSync(top, { recursive: true, force: true });
  }
}

function packageFiles(): Readonly<Record<string, string>> {
  return {
    'Package.swift': '// swift-tools-version: 6.0\n',
    'Sources/App.swift': 'print("hello")\n',
  };
}

function xcodeFiles(): Readonly<Record<string, string>> {
  return {
    'App.xcworkspace/contents.xcworkspacedata': '<Workspace/>\n',
    'Sources/App.swift': 'print("hello")\n',
  };
}

function resolve(root: string, home: string, phase: string, target = 'Sources/App.swift') {
  return resolveSwiftVerifyPlan(root, phase, {
    homeDirectory: home,
    targetFiles: [target],
  });
}

describe('Swift target StackPlugin', () => {
  it('is registered symmetrically while the frozen legacy preset remains unchanged', () => {
    withSwiftProject(packageFiles(), (root) => {
      assert.strictEqual(
        BUILTIN_PLUGINS.find((plugin) => plugin.id === 'swift'),
        swiftPlugin
      );
      assert.ok(swiftPlugin.target);
      assert.deepStrictEqual(swiftPlugin.gateIds, ['format', 'build', 'test', 'lint']);
      assert.deepStrictEqual(resolveSwiftPreset(root).gateNames('full', false), [
        'format',
        'build',
        'test',
        'lint',
      ]);
      assert.strictEqual(
        resolveSwiftPreset(root).environmentStateSource,
        'shared/verify/presets/swift.ts#swiftVerificationEnvironmentState'
      );
      assert.deepStrictEqual(swiftPlugin.target?.createPreset(swiftPlugin.detect(root)!).rules, []);
    });
  });

  it('uses root SwiftPM zero-YAML defaults in one dependency-closed DAG', () => {
    withSwiftProject(packageFiles(), (root, home) => {
      const code = resolve(root, home, 'code');
      const unit = resolve(root, home, 'unit');
      const integration = resolve(root, home, 'integration');
      const coverage = resolve(root, home, 'coverage');
      const full = resolve(root, home, 'full');
      assert.deepStrictEqual(
        code.plan.steps.map((step) => step.id),
        ['swift:build', 'swift:format-fix', 'swift:format', 'swift:lint']
      );
      assert.deepStrictEqual(
        unit.plan.steps.map((step) => step.id),
        [...code.plan.steps.map((step) => step.id), 'swift:test']
      );
      assert.deepStrictEqual(
        integration.plan.steps.map((step) => step.id),
        [...unit.plan.steps.map((step) => step.id), 'swift:integration']
      );
      assert.deepStrictEqual(
        coverage.plan.steps.map((step) => step.id),
        [...unit.plan.steps.map((step) => step.id), 'swift:coverage']
      );
      assert.deepStrictEqual(
        full.plan.steps.map((step) => step.id),
        [...unit.plan.steps.map((step) => step.id), 'swift:coverage', 'swift:integration']
      );
      assert.strictEqual(code.readiness.status, 'READY');
      assert.strictEqual(unit.readiness.status, 'READY');
      assert.strictEqual(integration.readiness.status, 'BLOCKED');
      assert.strictEqual(coverage.readiness.status, 'BLOCKED');
      assert.strictEqual(full.readiness.status, 'BLOCKED');
      assert.deepStrictEqual(
        unit.plan.steps.find((step) => step.id === 'swift:build')?.command?.argv.slice(-1),
        ['build']
      );
      assert.deepStrictEqual(
        unit.plan.steps.find((step) => step.id === 'swift:test')?.command?.argv.slice(-1),
        ['test']
      );
      assert.ok(
        unit.plan.steps
          .find((step) => step.id === 'swift:test')
          ?.envFail?.some((rule) => rule.outputMatches?.includes('package dependencies'))
      );
    });
  });

  it('preserves case-insensitive Xcode environment classification from the legacy preset', () => {
    withSwiftProject(xcodeFiles(), (root, home) => {
      const result = resolve(root, home, 'code');
      const targetRules =
        result.plan.steps.find((step) => step.id === 'swift:build')?.envFail ?? [];
      assert.ok(targetRules.length > 0);
      assert.ok(targetRules.every((rule) => rule.caseInsensitive === true));
      const targetPredicates = targetRules.map((rule, index) => {
        const { source: _source, ...serializable } = rule;
        const compiled = compileEnvFailRules([serializable], `target[${index}]`);
        assert.deepStrictEqual(compiled.errors, []);
        return compiled.predicates[0]!;
      });
      const legacyPredicates =
        planSwiftGates(result.project, result.scope, { pluginConfig: null }).find(
          (gate) => gate.id === 'build'
        )?.envFail ?? [];
      for (const output of [
        'cannot find simulator',
        'COULD NOT RESOLVE PACKAGE DEPENDENCIES',
        'ordinary compile failure',
      ]) {
        const outcome = { exitCode: 1, timedOut: false, stdout: '', stderr: output, output };
        assert.strictEqual(
          targetPredicates.some((predicate) => predicate(outcome)),
          legacyPredicates.some((predicate) => predicate(outcome)),
          output
        );
      }
    });
  });

  it('uses the checked-in zero-YAML fixture without authored config', () => {
    withSwiftProject(
      {
        'Package.swift': fs.readFileSync(path.join(ZERO_YAML, 'Package.swift'), 'utf8'),
        [TARGET]: fs.readFileSync(path.join(ZERO_YAML, TARGET), 'utf8'),
      },
      (root, home) => {
        const result = resolveSwiftVerifyPlan(root, 'unit', {
          homeDirectory: home,
          targetFiles: [TARGET],
        });
        assert.strictEqual(result.project.kind, 'package');
        assert.strictEqual(result.readiness.status, 'READY');
        assert.strictEqual(result.composed.migrationDiagnostics.length, 0);
      }
    );
  });

  it('does not detect a nested dependency Package.swift as a Swift root', () => {
    withSwiftProject(
      {
        'Dependencies/Library/Package.swift': '// swift-tools-version: 6.0\n',
        'Dependencies/Library/Source.swift': 'public struct Library {}\n',
      },
      (root, home) => {
        assert.strictEqual(swiftPlugin.detect(root), null);
        assert.throws(
          () => resolveSwiftVerifyPlan(root, 'code', { homeDirectory: home }),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_UNKNOWN_PLUGIN');
            return true;
          }
        );
      }
    );
  });

  it('bounds repair to exact normalized Swift Target Files and invalidates build', () => {
    withSwiftProject(
      {
        ...packageFiles(),
        'Sources/Z.swift': 'print("z")\n',
        'Sources/Unrelated.swift': 'print("no")\n',
      },
      (root, home) => {
        const result = resolveSwiftVerifyPlan(root, 'code', {
          homeDirectory: home,
          targetFiles: ['Sources/Z.swift', 'Sources/../Sources/App.swift', 'Sources/Z.swift'],
        });
        const repair = result.plan.steps.find((step) => step.id === 'swift:format-fix');
        assert.strictEqual(repair?.effect, 'repair');
        assert.deepStrictEqual(repair?.command?.argv.slice(-2), [
          'Sources/App.swift',
          'Sources/Z.swift',
        ]);
        assert.deepStrictEqual(repair?.writes?.include, ['Sources/App.swift', 'Sources/Z.swift']);
        assert.deepStrictEqual(repair?.invalidates, ['swift:build']);
        assert.ok(!repair?.command?.argv.includes('Sources/Unrelated.swift'));
      }
    );
  });

  it('keeps Xcode build/test commandless and selected readiness BLOCKED without identity', () => {
    withSwiftProject(xcodeFiles(), (root, home) => {
      const code = resolve(root, home, 'code');
      const unit = resolve(root, home, 'unit');
      assert.strictEqual(
        code.plan.steps.find((step) => step.id === 'swift:build')?.command,
        undefined
      );
      assert.strictEqual(
        unit.plan.steps.find((step) => step.id === 'swift:test')?.command,
        undefined
      );
      assert.strictEqual(code.readiness.status, 'BLOCKED');
      assert.ok(
        unit.readiness.entries.some(
          (entry) =>
            entry.requirementId === 'swift:xcode-identity:test' && entry.status === 'BLOCKED'
        )
      );
      assert.ok(
        unit.plan.steps.every(
          (step) =>
            !step.command?.argv.some((part) => part === '-scheme' || part === '-destination')
        )
      );
    });
  });

  it('blocks selected missing Swift/Xcode tools without probing unrelated commands', () => {
    withSwiftProject(
      packageFiles(),
      (root, home) => {
        const result = resolve(root, home, 'unit');
        const tool = result.readiness.entries.find(
          (entry) => entry.requirementId === 'swift:tool:swift:build'
        );
        assert.strictEqual(tool?.status, 'BLOCKED');
        assert.match(tool?.fix ?? '', /Apple Swift toolchain/);
      },
      { tools: ['swiftformat', 'swiftlint'] }
    );

    withSwiftProject(
      xcodeFiles(),
      (root, home) => {
        const result = resolve(root, home, 'unit');
        assert.strictEqual(result.readiness.status, 'BLOCKED');
        assert.strictEqual(
          result.plan.steps.find((step) => step.id === 'swift:build')?.command,
          undefined
        );
        assert.strictEqual(
          result.composed.provenance.has('verify.presets.swift.steps.build.command.argv'),
          false
        );
      },
      {
        tools: ['swiftformat', 'swiftlint'],
        yaml: [
          'stack:',
          '  swift:',
          '    xcode:',
          '      workspace: App.xcworkspace',
          '      scheme: App',
          '      destination: platform=macOS',
          '',
        ].join('\n'),
      }
    );
  });

  it('marks an unavailable optional Swift lint step as explicitly non-runnable', () => {
    withSwiftProject(
      packageFiles(),
      (root, home) => {
        const result = resolve(root, home, 'code');
        assert.strictEqual(
          result.plan.steps.find((step) => step.id === 'swift:lint')?.command,
          undefined
        );
        const lint = result.readiness.entries.find(
          (entry) => entry.stepId === 'swift:lint' && entry.disposition !== undefined
        );
        assert.strictEqual(lint?.status, 'DEGRADED');
        assert.strictEqual(lint?.disposition, 'optional-unavailable');
      },
      { tools: ['swift', 'swiftformat'] }
    );
  });

  it('constructs Xcode argv only from minimal project identity and preserves provenance', () => {
    withSwiftProject(
      xcodeFiles(),
      (root, home) => {
        const result = resolve(root, home, 'unit');
        const build = result.plan.steps.find((step) => step.id === 'swift:build');
        const test = result.plan.steps.find((step) => step.id === 'swift:test');
        assert.deepStrictEqual(build?.command?.argv.slice(1), [
          '-workspace',
          'App.xcworkspace',
          '-scheme',
          'App',
          '-destination',
          'platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2',
          'build',
        ]);
        assert.deepStrictEqual(test?.command?.argv.slice(1), [
          '-workspace',
          'App.xcworkspace',
          '-scheme',
          'App',
          '-destination',
          'platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2',
          '-testPlan',
          'App',
          'test',
        ]);
        assert.strictEqual(result.readiness.status, 'READY');
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.swift.steps.build.command.argv'),
          'gennady.yaml'
        );
      },
      {
        yaml: [
          'stack:',
          '  swift:',
          '    xcode:',
          '      workspace: App.xcworkspace',
          '      scheme: App',
          '      destination: platform=iOS Simulator,name=iPhone 15 Pro,OS=17.2',
          '      testPlan: App',
          '',
        ].join('\n'),
      }
    );
  });

  it('does not let unselected integration/coverage requirements block code or unit', () => {
    withSwiftProject(packageFiles(), (root, home) => {
      assert.strictEqual(resolve(root, home, 'code').readiness.status, 'READY');
      assert.strictEqual(resolve(root, home, 'unit').readiness.status, 'READY');
      assert.ok(
        !resolve(root, home, 'unit').readiness.entries.some((entry) =>
          entry.requirementId.startsWith('swift:command:')
        )
      );
    });
  });

  it('accepts explicit read-only integration/coverage commands with target provenance', () => {
    withSwiftProject(
      packageFiles(),
      (root, home) => {
        const result = resolve(root, home, 'full');
        assert.strictEqual(result.readiness.status, 'READY');
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'swift:integration')?.command?.argv,
          ['swift', 'test', '--filter', 'Integration']
        );
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.swift.steps.integration.command.argv'),
          'gennady.yaml'
        );
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  integration: {
                    command: { argv: ['swift', 'test', '--filter', 'Integration'], cwd: '.' },
                  },
                  coverage: {
                    command: { argv: ['swift', 'test', '--enable-code-coverage'], cwd: '.' },
                  },
                },
              },
            },
          },
        }),
      }
    );
  });

  it('rejects target Xcode argv guessing but grandfathers legacy overrideGates', () => {
    withSwiftProject(
      xcodeFiles(),
      (root, home) => {
        assert.throws(
          () => resolve(root, home, 'unit'),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED');
            assert.strictEqual(error.path, 'verify.presets.swift.steps.build.command.argv');
            return true;
          }
        );
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  build: { command: { argv: ['xcodebuild', '-scheme', 'Guessed'], cwd: '.' } },
                },
              },
            },
          },
        }),
      }
    );

    withSwiftProject(
      xcodeFiles(),
      (root, home) => {
        const result = resolve(root, home, 'unit');
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'swift:build')?.command?.argv,
          ['project-tool', 'build']
        );
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'swift:test')?.command?.argv,
          ['project-tool', 'test']
        );
        assert.strictEqual(result.readiness.status, 'READY');
        assert.ok(result.composed.migrationDiagnostics.length >= 2);
      },
      {
        tools: ['swiftformat', 'swiftlint'],
        yaml: JSON.stringify({
          stack: {
            swift: {
              overrideGates: {
                build: { argv: ['project-tool', 'build'] },
                test: { argv: ['project-tool', 'test'] },
              },
            },
          },
        }),
      }
    );
  });

  it('mirrors legacy format skip to repair as visible compatibility waivers', () => {
    withSwiftProject(
      packageFiles(),
      (root, home) => {
        const result = resolve(root, home, 'code');
        assert.strictEqual(result.readiness.status, 'DEGRADED');
        assert.deepStrictEqual(result.composed.waivers.map((waiver) => waiver.stepId).sort(), [
          'swift:format',
          'swift:format-fix',
        ]);
        assert.strictEqual(
          result.readiness.entries.filter((entry) => entry.status === 'WAIVED').length,
          2
        );
      },
      {
        yaml: 'stack:\n  swift:\n    skipGates: [format]\n',
      }
    );
  });

  it('fails incomplete custom steps, malformed identity and unsafe repair config closed', () => {
    const cases = [
      {
        yaml: 'verify:\n  presets:\n    swift:\n      steps:\n        missing: {}\n',
        code: 'VERIFY_CONFIG_INVALID_TYPE',
      },
      {
        yaml: 'stack:\n  swift:\n    xcode:\n      workspace: App.xcworkspace\n      scheme: App\n',
        code: 'VERIFY_CONFIG_LEGACY_UNSUPPORTED',
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  'format-fix': {
                    command: { argv: ['swiftformat', '.'], cwd: '.' },
                  },
                },
              },
            },
          },
        }),
        code: 'VERIFY_CONFIG_INVALID_TYPE',
      },
    ];
    for (const testCase of cases) {
      withSwiftProject(
        packageFiles(),
        (root, home) => {
          assert.throws(
            () => resolve(root, home, 'code'),
            (error: unknown) => {
              assert.ok(error instanceof VerifyConfigError);
              assert.strictEqual(error.code, testCase.code);
              return true;
            }
          );
        },
        { yaml: testCase.yaml }
      );
    }
  });

  it('rejects escaping Xcode identity even when xcodebuild is unavailable', () => {
    withSwiftProject(
      xcodeFiles(),
      (root, home) => {
        assert.throws(
          () => resolve(root, home, 'code'),
          (error: unknown) => {
            assert.ok(error instanceof VerifyConfigError);
            assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_TYPE');
            assert.strictEqual(error.path, 'stack.swift.xcode.workspace');
            return true;
          }
        );
      },
      {
        tools: ['swiftformat', 'swiftlint'],
        yaml: [
          'stack:',
          '  swift:',
          '    xcode:',
          '      workspace: ../App.xcworkspace',
          '      scheme: App',
          '      destination: platform=macOS',
          '',
        ].join('\n'),
      }
    );
  });

  it('rejects Xcode identity traversing a symlink parent or naming a symlink', () => {
    for (const finalSymlink of [false, true]) {
      withSwiftProject(
        xcodeFiles(),
        (root, home) => {
          const external = path.join(path.dirname(root), 'external');
          fs.mkdirSync(path.join(external, 'App.xcworkspace'), { recursive: true });
          if (finalSymlink) {
            fs.symlinkSync(
              path.join(external, 'App.xcworkspace'),
              path.join(root, 'Linked.xcworkspace')
            );
          } else {
            fs.symlinkSync(external, path.join(root, 'a-link'));
          }

          assert.throws(
            () => resolve(root, home, 'code'),
            (error: unknown) => {
              assert.ok(error instanceof VerifyConfigError);
              assert.strictEqual(error.code, 'VERIFY_CONFIG_INVALID_TYPE');
              assert.strictEqual(error.path, 'stack.swift.xcode.workspace');
              assert.match(error.message, /symlink/);
              return true;
            }
          );
        },
        {
          yaml: [
            'stack:',
            '  swift:',
            '    xcode:',
            `      workspace: ${finalSymlink ? 'Linked.xcworkspace' : 'a-link/App.xcworkspace'}`,
            '      scheme: App',
            '      destination: platform=macOS',
            '',
          ].join('\n'),
        }
      );
    }
  });

  it('preserves personal-highest target config while legacy HOME priority stays isolated', () => {
    withSwiftProject(
      packageFiles(),
      (root, home) => {
        const result = resolve(root, home, 'integration');
        assert.deepStrictEqual(
          result.plan.steps.find((step) => step.id === 'swift:integration')?.command?.argv,
          ['swift', 'test', '--filter', 'PersonalIntegration']
        );
        assert.strictEqual(
          result.composed.provenance.get('verify.presets.swift.steps.integration.command.argv'),
          '~/.gennadyrc'
        );
      },
      {
        yaml: JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  integration: {
                    command: {
                      argv: ['swift', 'test', '--filter', 'ProjectIntegration'],
                      cwd: '.',
                    },
                  },
                },
              },
            },
          },
        }),
        personal: JSON.stringify({
          verify: {
            presets: {
              swift: {
                steps: {
                  integration: {
                    command: { argv: ['swift', 'test', '--filter', 'PersonalIntegration'] },
                  },
                },
              },
            },
          },
        }),
      }
    );
  });
});
