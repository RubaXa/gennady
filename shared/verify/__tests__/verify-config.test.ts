// @file: Contract tests for target verify config loading, precedence, provenance and composition.
// @consumers: CI
// @spec: CLI-VERIFY

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DetectedVerifyConfigLayer, VerifyConfigError, VerifyPreset } from '../plugin-api.ts';
import {
  composePresets,
  loadVerifyConfig,
  resolveSddVerifySelector,
  selectPhase,
} from '../plugin-api.ts';
import { loadConfigSection } from '../../../services/config/config-loader.ts';

type VerifyConfigContext = {
  readonly root: string;
  readonly home: string;
  readonly presets: readonly VerifyPreset[];
  readonly writeProject: (name: string, content: string) => void;
  readonly writePersonal: (content: string) => void;
  readonly cleanup: () => void;
};

/** @purpose Create isolated project/home sources and one concrete Node preset. */
function createVerifyConfigContext(): VerifyConfigContext {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-config-'));
  const root = path.join(parent, 'repo');
  const home = path.join(parent, 'home');
  fs.mkdirSync(root);
  fs.mkdirSync(home);
  const preset: VerifyPreset = {
    plugin: 'node',
    steps: [
      {
        id: 'type-check',
        plugin: 'node',
        tags: ['code'],
        needs: [],
        executor: 'local',
        effect: 'observe',
        command: {
          argv: ['npm', 'run', 'type-check'],
          cwd: root,
          env: { BUILTIN: 'yes', CONFLICT: 'builtin' },
          timeoutMs: 60_000,
        },
        requires: [],
        timeoutMs: 60_000,
        onFailure: 'stop-phase',
      },
      {
        id: 'unit',
        plugin: 'node',
        tags: ['test'],
        needs: ['type-check'],
        executor: 'local',
        effect: 'observe',
        command: {
          argv: ['npm', 'test'],
          cwd: root,
          env: { BUILTIN: 'yes', CONFLICT: 'builtin' },
          timeoutMs: 60_000,
        },
        requires: [],
        timeoutMs: 60_000,
        onFailure: 'stop-phase',
      },
    ],
    phases: {
      code: { include: ['code'] },
      test: { include: ['test'] },
    },
    sddKinds: { impl: 'code', test: 'test' },
    requirements: [],
    rules: [],
  };
  return {
    root,
    home,
    presets: [preset],
    writeProject: (name, content) => fs.writeFileSync(path.join(root, name), content),
    writePersonal: (content) => fs.writeFileSync(path.join(home, '.gennadyrc'), content),
    cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
  };
}

/** @purpose Assert one load error by typed code and exact config path. */
function expectLoadError(
  errors: readonly VerifyConfigError[],
  code: VerifyConfigError['code'],
  keyPath: string
): void {
  assert.ok(errors.some((error) => error.code === code && error.path === keyPath));
}

describe('target verify config', () => {
  it('uses personal-highest target priority without changing the legacy loader default', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        '.gennadyrc',
        JSON.stringify({
          verify: {
            sdd: { mapping: { impl: 'test' } },
            presets: { node: { steps: { unit: { tags: ['project'] } } } },
          },
        })
      );
      context.writePersonal(
        JSON.stringify({
          verify: {
            sdd: { mapping: { impl: 'code' } },
            presets: { node: { steps: { unit: { tags: ['test', 'personal'] } } } },
          },
        })
      );

      const legacy = loadConfigSection(context.root, 'verify', {
        homeDirectory: context.home,
      });
      const target = loadVerifyConfig(context.root, context.presets, context.home);

      assert.deepStrictEqual(
        (
          (
            (legacy.section?.['presets'] as Record<string, unknown>)['node'] as Record<
              string,
              unknown
            >
          )['steps'] as Record<string, Record<string, unknown>>
        )['unit']?.['tags'],
        ['project']
      );
      assert.deepStrictEqual(target.config?.presets.node?.steps.unit?.tags, ['test', 'personal']);
      assert.strictEqual(target.config?.sdd?.mapping.impl, 'code');
      assert.strictEqual(target.provenance.get('presets.node.steps.unit.tags'), '~/.gennadyrc');
      assert.strictEqual(target.provenance.get('sdd.mapping.impl'), '~/.gennadyrc');
      const composed = composePresets({ presets: context.presets, files: target });
      assert.deepStrictEqual(resolveSddVerifySelector(composed, 'impl'), {
        kind: 'impl',
        selector: 'code',
        source: '~/.gennadyrc',
      });
      assert.deepStrictEqual(target.sources, ['~/.gennadyrc', '.gennadyrc']);
    } finally {
      context.cleanup();
    }
  });

  it('replaces arrays, deep-merges command objects and retains leaf provenance', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        [
          'verify:',
          '  presets:',
          '    node:',
          '      steps:',
          '        unit:',
          '          tags: [test, yaml]',
          '          command:',
          '            cwd: packages/app',
          '            env: { YAML: one, CONFLICT: yaml }',
          '          timeout: 2m',
          '',
        ].join('\n')
      );
      context.writeProject(
        '.gennadyrc',
        JSON.stringify({
          verify: {
            presets: {
              node: {
                steps: {
                  unit: {
                    tags: ['test', 'project'],
                    command: { env: { PROJECT: 'yes', CONFLICT: 'project' } },
                  },
                },
              },
            },
          },
        })
      );
      context.writePersonal(
        JSON.stringify({
          verify: {
            presets: {
              node: {
                steps: {
                  unit: {
                    tags: ['test', 'personal'],
                    command: { env: { PERSONAL: 'yes', CONFLICT: 'personal' } },
                    onFailure: 'continue',
                  },
                },
              },
            },
          },
        })
      );
      const loaded = loadVerifyConfig(context.root, context.presets, context.home);
      assert.deepStrictEqual(loaded.errors, []);
      assert.strictEqual(
        loaded.config?.presets.node?.steps.unit?.command?.cwd,
        path.join(context.root, 'packages/app')
      );

      const detected: DetectedVerifyConfigLayer = {
        source: 'package.json',
        config: {
          presets: {
            node: {
              steps: {
                unit: {
                  tags: ['test', 'detected'],
                  command: { env: { DETECTED: 'yes', CONFLICT: 'detected' } },
                },
              },
            },
          },
        },
      };
      const composed = composePresets({
        presets: context.presets,
        detected: [detected],
        files: loaded,
      });
      const unit = composed.presets[0]?.steps.find((step) => step.id === 'unit');

      assert.deepStrictEqual(
        unit?.tags,
        ['test', 'personal'],
        'arrays replace at every higher layer'
      );
      assert.deepStrictEqual(unit?.command?.env, {
        BUILTIN: 'yes',
        CONFLICT: 'personal',
        DETECTED: 'yes',
        YAML: 'one',
        PROJECT: 'yes',
        PERSONAL: 'yes',
      });
      assert.strictEqual(unit?.command?.cwd, path.join(context.root, 'packages/app'));
      assert.strictEqual(unit?.timeoutMs, 120_000);
      assert.strictEqual(unit?.command?.timeoutMs, 120_000);
      assert.strictEqual(
        composed.provenance.get('verify.presets.node.steps.unit.command.env.YAML'),
        'gennady.yaml'
      );
      assert.strictEqual(
        composed.provenance.get('verify.presets.node.steps.unit.command.env.PROJECT'),
        '.gennadyrc'
      );
      assert.strictEqual(
        composed.provenance.get('verify.presets.node.steps.unit.command.env.CONFLICT'),
        '~/.gennadyrc'
      );
    } finally {
      context.cleanup();
    }
  });

  it('requires a non-empty reason for explicit disable and retains a valid waiver', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          enabled: false\n'
      );
      const invalid = loadVerifyConfig(context.root, context.presets, context.home);
      expectLoadError(
        invalid.errors,
        'VERIFY_CONFIG_DISABLE_REASON_REQUIRED',
        'verify.presets.node.steps.type-check.reason'
      );
      assert.strictEqual(invalid.config, null);

      context.writeProject(
        'gennady.yaml',
        'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          enabled: false\n          reason: covered by remote CI\n'
      );
      const valid = loadVerifyConfig(context.root, context.presets, context.home);
      const composed = composePresets({ presets: context.presets, files: valid });
      assert.deepStrictEqual(composed.waivers, [
        {
          stepId: 'node:type-check',
          reason: 'covered by remote CI',
          source: 'gennady.yaml',
        },
      ]);
      assert.ok(
        composed.presets[0]?.steps.some((step) => step.id === 'type-check'),
        'the DAG node stays present so dependency validation cannot turn a waiver into a missing ref'
      );
      assert.deepStrictEqual(
        composed.presets[0]?.steps.find((step) => step.id === 'unit')?.needs,
        ['type-check'],
        'an enabled dependent retains its edge to the waived node for U3 policy handling'
      );

      context.writePersonal(
        JSON.stringify({
          verify: { presets: { node: { steps: { 'type-check': { enabled: true } } } } },
        })
      );
      const reenabled = composePresets({
        presets: context.presets,
        files: loadVerifyConfig(context.root, context.presets, context.home),
      });
      assert.deepStrictEqual(reenabled.waivers, []);
    } finally {
      context.cleanup();
    }
  });

  it('rejects orphan policy reasons but accepts a higher-layer reason over lower blocking false', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        'verify:\n  presets:\n    node:\n      reason: orphan explanation\n'
      );
      expectLoadError(
        loadVerifyConfig(context.root, context.presets, context.home).errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.reason'
      );

      context.writeProject(
        'gennady.yaml',
        'verify:\n  presets:\n    node:\n      blocking: true\n      reason: contradictory explanation\n'
      );
      expectLoadError(
        loadVerifyConfig(context.root, context.presets, context.home).errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.reason'
      );

      context.writeProject(
        'gennady.yaml',
        ['verify:', '  presets:', '    node:', '      blocking: false', ''].join('\n')
      );
      context.writeProject(
        '.gennadyrc',
        JSON.stringify({
          verify: { presets: { node: { reason: 'project-specific explanation' } } },
        })
      );

      const loaded = loadVerifyConfig(context.root, context.presets, context.home);
      assert.deepStrictEqual(loaded.errors, []);
      assert.deepStrictEqual(loaded.config?.presets.node, {
        steps: {},
        blocking: false,
        reason: 'project-specific explanation',
      });
      const composed = composePresets({ presets: context.presets, files: loaded });
      assert.deepStrictEqual(composed.policies, [
        {
          plugin: 'node',
          blocking: false,
          reason: 'project-specific explanation',
          source: 'gennady.yaml',
          reasonSource: '.gennadyrc',
        },
      ]);
      assert.strictEqual(composed.provenance.get('verify.presets.node.blocking'), 'gennady.yaml');
      assert.strictEqual(composed.provenance.get('verify.presets.node.reason'), '.gennadyrc');
    } finally {
      context.cleanup();
    }
  });

  it('fails closed on unknown plugin, incomplete custom step and field without partial config', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        [
          'verify:',
          '  presets:',
          '    rust:',
          '      steps: {}',
          '    node:',
          '      steps:',
          '        absent: { enabled: true }',
          '        unit: { timeot: 5m }',
          '',
        ].join('\n')
      );
      const loaded = loadVerifyConfig(context.root, context.presets, context.home);

      expectLoadError(loaded.errors, 'VERIFY_CONFIG_UNKNOWN_PLUGIN', 'verify.presets.rust');
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.steps.absent.tags'
      );
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_UNKNOWN_FIELD',
        'verify.presets.node.steps.unit.timeot'
      );
      assert.strictEqual(loaded.config, null);
    } finally {
      context.cleanup();
    }
  });

  it('adds one declarative step, selects it by an arbitrary id and composes SDD mapping provenance', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        [
          'verify:',
          '  sdd:',
          '    mapping:',
          '      release-candidate: deploy',
          '  presets:',
          '    node:',
          '      phases:',
          '        deploy: { include: [deploy] }',
          '      steps:',
          '        deploy:',
          '          tags: [deploy]',
          '          needs: [unit]',
          '          executor: local',
          '          effect: observe',
          '          command:',
          '            argv: [node, verify-deploy.mjs]',
          '            cwd: .',
          '          timeout: 2m',
          '          onFailure: stop-phase',
          '',
        ].join('\n')
      );

      const loaded = loadVerifyConfig(context.root, context.presets, context.home);
      assert.deepStrictEqual(loaded.errors, []);
      const composed = composePresets({ presets: context.presets, files: loaded });
      const mapping = resolveSddVerifySelector(composed, 'release-candidate');
      const plan = selectPhase(composed.presets, mapping.selector);

      assert.deepStrictEqual(mapping, {
        kind: 'release-candidate',
        selector: 'deploy',
        source: 'gennady.yaml',
      });
      assert.deepStrictEqual(
        plan.steps.map((step) => step.id),
        ['node:type-check', 'node:unit', 'node:deploy'],
        'the selector contributes one seed while needs supplies the complete dependency closure'
      );
      assert.strictEqual(
        composed.provenance.get('verify.presets.node.phases.deploy.include'),
        'gennady.yaml'
      );
      assert.strictEqual(
        composed.provenance.get('verify.sdd.mapping.release-candidate'),
        'gennady.yaml'
      );
    } finally {
      context.cleanup();
    }
  });

  it('fails only after mapping composition when kind is unresolved or selector is undeclared', () => {
    const context = createVerifyConfigContext();
    try {
      const defaults = composePresets({ presets: context.presets });
      assert.throws(
        () => resolveSddVerifySelector(defaults, 'deploy'),
        (error: unknown) => {
          const typed = error as VerifyConfigError;
          assert.strictEqual(typed.code, 'VERIFY_CONFIG_UNRESOLVED_SDD_KIND');
          assert.strictEqual(typed.path, 'verify.sdd.mapping.deploy');
          return true;
        }
      );

      context.writeProject(
        'gennady.yaml',
        'verify:\n  sdd:\n    mapping:\n      deploy: missing-selector\n'
      );
      const composed = composePresets({
        presets: context.presets,
        files: loadVerifyConfig(context.root, context.presets, context.home),
      });
      assert.throws(
        () => resolveSddVerifySelector(composed, 'deploy'),
        (error: unknown) => {
          const typed = error as VerifyConfigError;
          assert.strictEqual(typed.code, 'VERIFY_CONFIG_UNKNOWN_SELECTOR');
          assert.strictEqual(typed.source, 'gennady.yaml');
          assert.match(typed.hint, /verify\.presets\.<plugin>\.phases\.missing-selector/);
          return true;
        }
      );
    } finally {
      context.cleanup();
    }
  });

  it('lets an explicit project mapping resolve disagreeing built-in defaults', () => {
    const context = createVerifyConfigContext();
    try {
      const node = context.presets[0]!;
      const golang: VerifyPreset = {
        ...node,
        plugin: 'golang',
        steps: node.steps.map((step) => ({ ...step, plugin: 'golang' })),
        sddKinds: { impl: 'test' },
      };
      assert.throws(
        () => composePresets({ presets: [node, golang] }),
        (error: unknown) => {
          const typed = error as VerifyConfigError;
          assert.strictEqual(typed.code, 'VERIFY_CONFIG_CONFLICTING_SDD_DEFAULT');
          assert.strictEqual(typed.path, 'verify.sdd.mapping.impl');
          return true;
        }
      );

      context.writeProject('gennady.yaml', 'verify:\n  sdd:\n    mapping:\n      impl: code\n');
      const loaded = loadVerifyConfig(context.root, [node, golang], context.home);
      const composed = composePresets({ presets: [node, golang], files: loaded });
      assert.deepStrictEqual(resolveSddVerifySelector(composed, 'impl'), {
        kind: 'impl',
        selector: 'code',
        source: 'gennady.yaml',
      });
    } finally {
      context.cleanup();
    }
  });

  it('fails closed on invalid type, duration and dependency reference', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        [
          'verify:',
          '  presets:',
          '    node:',
          '      steps:',
          '        unit:',
          '          tags: test',
          '          timeout: 0s',
          '          needs: [missing]',
          '',
        ].join('\n')
      );
      const loaded = loadVerifyConfig(context.root, context.presets, context.home);

      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.steps.unit.tags'
      );
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_DURATION',
        'verify.presets.node.steps.unit.timeout'
      );
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_REFERENCE',
        'verify.presets.node.steps.unit.needs'
      );
      assert.strictEqual(loaded.config, null);
    } finally {
      context.cleanup();
    }
  });

  it('rejects absolute and escaping paths instead of widening command or write scope', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        [
          'verify:',
          '  presets:',
          '    node:',
          '      steps:',
          '        type-check:',
          '          command: { cwd: /tmp/outside }',
          '          writes:',
          '            root: ../outside',
          '            include: ["**/*"]',
          '',
        ].join('\n')
      );

      const loaded = loadVerifyConfig(context.root, context.presets, context.home);
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.steps.type-check.command.cwd'
      );
      expectLoadError(
        loaded.errors,
        'VERIFY_CONFIG_INVALID_TYPE',
        'verify.presets.node.steps.type-check.writes.root'
      );
      assert.strictEqual(loaded.config, null);
      assert.ok(loaded.errors.every((error) => /repository root/.test(error.message + error.hint)));
    } finally {
      context.cleanup();
    }
  });

  it('accepts npmScript as plugin-owned syntax but defers materialization actionably to UV-04', () => {
    const context = createVerifyConfigContext();
    try {
      context.writeProject(
        'gennady.yaml',
        'verify:\n  presets:\n    node:\n      steps:\n        type-check:\n          command: { npmScript: check:types }\n'
      );
      const loaded = loadVerifyConfig(context.root, context.presets, context.home);
      assert.deepStrictEqual(loaded.errors, []);
      assert.strictEqual(
        loaded.config?.presets.node?.steps['type-check']?.command?.npmScript,
        'check:types'
      );

      assert.throws(
        () => composePresets({ presets: context.presets, files: loaded }),
        (error: unknown) => {
          const typed = error as VerifyConfigError;
          assert.strictEqual(typed.code, 'VERIFY_CONFIG_PLUGIN_COMMAND_UNRESOLVED');
          assert.strictEqual(typed.path, 'verify.presets.node.steps.type-check.command.npmScript');
          assert.match(typed.hint, /UV-04.*command\.argv/);
          return true;
        }
      );
    } finally {
      context.cleanup();
    }
  });

  it('produces the same presets and provenance for different map insertion order', () => {
    const context = createVerifyConfigContext();
    try {
      const first: DetectedVerifyConfigLayer = {
        source: 'facts',
        config: {
          presets: {
            node: {
              steps: {
                unit: { tags: ['test', 'stable'], command: { env: { B: '2', A: '1' } } },
                'type-check': { onFailure: 'continue' },
              },
            },
          },
        },
      };
      const second: DetectedVerifyConfigLayer = {
        source: 'facts',
        config: {
          presets: {
            node: {
              steps: {
                'type-check': { onFailure: 'continue' },
                unit: { command: { env: { A: '1', B: '2' } }, tags: ['test', 'stable'] },
              },
            },
          },
        },
      };

      const left = composePresets({ presets: context.presets, detected: [first] });
      const right = composePresets({ presets: context.presets, detected: [second] });
      assert.deepStrictEqual(left.presets, right.presets);
      assert.deepStrictEqual([...left.provenance], [...right.provenance]);
      assert.strictEqual(JSON.stringify(left.presets), JSON.stringify(right.presets));
    } finally {
      context.cleanup();
    }
  });

  it('revalidates the final composed DAG after detected overlays', () => {
    const context = createVerifyConfigContext();
    try {
      const cyclic: DetectedVerifyConfigLayer = {
        source: 'package.json',
        config: {
          presets: {
            node: {
              steps: {
                'type-check': { needs: ['unit'] },
              },
            },
          },
        },
      };

      assert.throws(
        () => composePresets({ presets: context.presets, detected: [cyclic] }),
        (error: unknown) => {
          const typed = error as VerifyConfigError;
          assert.strictEqual(typed.code, 'VERIFY_CONFIG_INVALID_PLAN');
          assert.strictEqual(typed.path, 'verify.presets');
          assert.match(typed.message, /dependency cycle/);
          return true;
        }
      );
    } finally {
      context.cleanup();
    }
  });
});
