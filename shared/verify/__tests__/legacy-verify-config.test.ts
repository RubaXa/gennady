// @file: Contract tests for lossless legacy stack-config migration into target verify overlays.
// @consumers: CI
// @spec: CLI-VERIFY

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VerifyPreset } from '../plugin-api.ts';
import { adaptLegacyStackConfig, composePresets } from '../plugin-api.ts';
import type { StackConfig } from '../verify.types.ts';

type LegacyConfigContext = {
  readonly root: string;
  readonly presets: readonly VerifyPreset[];
};

/** @purpose Build one concrete preset whose ids match the legacy gate vocabulary. */
function createLegacyConfigContext(): LegacyConfigContext {
  const root = '/repo';
  return {
    root,
    presets: [
      {
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
              env: { BASE: 'yes' },
              timeoutMs: 60_000,
            },
            requires: [],
            timeoutMs: 60_000,
            onFailure: 'stop-phase',
          },
        ],
        phases: { code: { include: ['code'] } },
        sddKinds: { impl: 'code' },
        requirements: [],
        rules: [],
      },
    ],
  };
}

describe('legacy verify config adapter', () => {
  it('translates skip and basic command overrides with migration provenance', () => {
    const context = createLegacyConfigContext();
    const config: StackConfig = {
      node: {
        skipGates: ['type-check'],
        overrideGates: {
          'type-check': {
            argv: ['pnpm', 'check'],
            cwd: 'packages/app',
            env: { LEGACY: 'yes' },
            timeout: '5m',
          },
        },
      },
    };
    const provenance = new Map([
      ['node.skipGates', '.gennadyrc'],
      ['node.overrideGates.type-check.argv', 'gennady.yaml'],
      ['node.overrideGates.type-check.cwd', 'gennady.yaml'],
      ['node.overrideGates.type-check.env', '.gennadyrc'],
      ['node.overrideGates.type-check.timeout', '.gennadyrc'],
    ]);

    const adapter = adaptLegacyStackConfig(context.root, context.presets, config, provenance);
    assert.deepStrictEqual(adapter.errors, []);
    const composed = composePresets({ presets: context.presets, legacy: adapter });
    const step = composed.presets[0]?.steps[0];

    assert.deepStrictEqual(step?.command, {
      argv: ['pnpm', 'check'],
      cwd: '/repo/packages/app',
      env: { BASE: 'yes', LEGACY: 'yes' },
      timeoutMs: 300_000,
    });
    assert.strictEqual(step?.timeoutMs, 300_000);
    assert.strictEqual(composed.waivers[0]?.stepId, 'node:type-check');
    assert.match(composed.waivers[0]?.reason ?? '', /legacy skipGates.*migrate/);
    assert.strictEqual(
      composed.provenance.get('verify.presets.node.steps.type-check.command.argv'),
      'legacy:gennady.yaml'
    );
    assert.strictEqual(
      composed.provenance.get('verify.presets.node.steps.type-check.command.env.LEGACY'),
      'legacy:.gennadyrc'
    );
    assert.ok(composed.migrationDiagnostics.length >= 5);
  });

  it('rejects non-lossless legacy fields instead of silently dropping semantics', () => {
    const context = createLegacyConfigContext();
    const config: StackConfig = {
      node: {
        overrideGates: {
          'type-check': {
            envFail: [{ stderrMatches: 'offline' }],
            fixer: { argv: ['npm', 'run', 'fix'] },
          },
        },
        extraGates: [{ id: 'browser', argv: ['npm', 'run', 'e2e'] }],
      },
    };
    const adapter = adaptLegacyStackConfig(context.root, context.presets, config, new Map());

    assert.strictEqual(adapter.config, null);
    assert.deepStrictEqual(
      adapter.errors.map((error) => error.path),
      [
        'stack.node.overrideGates.type-check.envFail',
        'stack.node.overrideGates.type-check.fixer',
        'stack.node.extraGates',
      ]
    );
    assert.ok(adapter.errors.every((error) => error.code === 'VERIFY_CONFIG_LEGACY_UNSUPPORTED'));
    assert.throws(
      () => composePresets({ presets: context.presets, legacy: adapter }),
      /has no lossless UV-03 target representation/
    );
  });

  it('rejects a legacy gate id that no target preset owns', () => {
    const context = createLegacyConfigContext();
    const adapter = adaptLegacyStackConfig(
      context.root,
      context.presets,
      { node: { skipGates: ['absent'] } },
      new Map([['node.skipGates', 'gennady.yaml']])
    );

    assert.strictEqual(adapter.config, null);
    assert.strictEqual(adapter.errors[0]?.code, 'VERIFY_CONFIG_UNKNOWN_STEP');
    assert.strictEqual(adapter.errors[0]?.path, 'stack.node.skipGates');
    assert.match(adapter.errors[0]?.hint ?? '', /known: type-check/);
  });
});
