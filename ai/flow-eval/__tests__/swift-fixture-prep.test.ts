// @file: E-10/E-18 deterministic Swift fixture compatibility and isolated preparation.
// @spec: AI-SKILLS
// @consumers: CI, roundtrip-eval.sh

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { resolveAssembledFullProfile } from '../../../cli/cmd/sdd-verify/full-profile-plan.ts';
import { resolvePhaseVerificationPlan } from '../../../shared/sdd/phase-verification-plan.ts';
import { resolveReadinessAdapter } from '../../../shared/sdd/readiness.ts';
import type { TicketCorpusRef } from '../../../shared/sdd/ticket-resolve.ts';
import {
  loadStackConfig,
  pluginConfigOf,
  applyStackConfig,
} from '../../../shared/verify/stack-config.ts';
import { BUILTIN_GATE_IDS } from '../../../shared/verify/stack-registry.ts';
import { prepareSwiftRoundtripFixture } from '../swift-fixture-prep.ts';

const LEGACY_CONFIG = `
stack:
  use: [anystack]
  anystack:
    extraGates:
      - id: swiftlint
        cwd: MRCloudApp
        argv: [mise, exec, --, swiftlint, lint, --strict]
        timeout: 10m
        fixer:
          cwd: MRCloudApp
          timeout: 10m
          argv: [sh, -c, "printf '%s\\n' changed.swift | xargs swiftlint --fix"]
      - id: build
        requires:
          - argv: [test, -d, MRCloudApp/TuistCloudApp.xcworkspace]
            hint: generate workspace
        argv: [sh, -c, "xcodebuild build -workspace MRCloudApp/TuistCloudApp.xcworkspace"]
        timeout: 90m
      - id: unit-tests
        argv: [sh, -c, "xcodebuild test -resultBundlePath build/xcresult/TestResults.xcresult"]
        timeout: 90m
`;

const CANONICAL_V19_SCOPE = [
  'MRCloudApp/**',
  'Tools/**',
  'Tuist/**',
  'Project.swift',
  'Tuist.swift',
  '.mise.toml',
  '.xcode-version',
  '.gitmodules',
] as const;
const E10_SCOPED_CONFIG = LEGACY_CONFIG.replace(
  '      - id: build\n',
  `      - id: build\n        when: [${CANONICAL_V19_SCOPE.join(', ')}]\n`
).replace(
  '      - id: unit-tests\n',
  `      - id: unit-tests\n        when: [${CANONICAL_V19_SCOPE.join(', ')}]\n`
);

const roots: string[] = [];
const GENNADY = path.resolve('cli/gennady.ts');
const TSX_LOADER = path.resolve('node_modules/tsx/dist/loader.mjs');

function runCli(root: string, ...args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ['--import', TSX_LOADER, GENNADY, ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: process.env,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function rootWithConfig(config = LEGACY_CONFIG): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-fixture-prep-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'gennady.yaml'), config);
  fs.writeFileSync(path.join(root, 'Project.swift'), 'import ProjectDescription\n');
  return root;
}

function phaseTicket(target: string): TicketCorpusRef {
  const file = '/repo/specs/app/app.task.SWIFT-ROUNDTRIP.md';
  return {
    file,
    taskId: 'SWIFT-ROUNDTRIP',
    status: '[ ] TODO',
    dependencies: [],
    scope: 'app',
    flowVersion: 'v2',
    content: [
      '<!--SECTION:META-->',
      '- **Task-ID:** SWIFT-ROUNDTRIP',
      '- **Status:** [ ] TODO',
      '- **Scope:** app',
      '- **Dependencies:** None',
      '<!--/SECTION:META-->',
      '<!--SECTION:PHASES_OVERVIEW-->',
      '| ID | Kind | Deps | Status |',
      '|---|---|---|---|',
      '| P1 | impl | — | [ ] |',
      '<!--/SECTION:PHASES_OVERVIEW-->',
      '<!--SECTION:PHASE_P1-->',
      '- **Rules:**',
      '  - none',
      '- **Target Files:**',
      `  - ${target}`,
      '- **Deleted Files:**',
      '  - none',
      '<!--/SECTION:PHASE_P1-->',
      '<!--SECTION:VERIFICATION-->',
      '- **Coverage Policy:** not-applicable',
      '- **Coverage Reason:** fixture',
      '| Command | Required by | Role |',
      '|---|---|---|',
      '| — | — | extra |',
      '<!--/SECTION:VERIFICATION-->',
    ].join('\n'),
  };
}

function withFakeSwiftTools(run: () => void): void {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-fixture-tools-'));
  roots.push(bin);
  for (const tool of ['swift', 'xcodebuild']) {
    const executable = path.join(bin, tool);
    fs.writeFileSync(executable, '#!/bin/sh\nprintf "version\\n"\n');
    fs.chmodSync(executable, 0o755);
  }
  const previous = process.env['PATH'];
  process.env['PATH'] = `${bin}:/usr/bin:/bin`;
  try {
    run();
  } finally {
    process.env['PATH'] = previous;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('E-10 immutable legacy anystack compatibility', () => {
  it('keeps all three real gate literals and reaches readiness without a package shim', () => {
    const root = rootWithConfig(E10_SCOPED_CONFIG);
    const loaded = loadStackConfig(root, BUILTIN_GATE_IDS);
    assert.deepEqual(loaded.errors, []);
    const plan = resolveAssembledFullProfile(root, loaded.config);

    assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
    assert.equal(plan.primary, 'anystack');
    assert.deepEqual(
      plan.gates.map((gate) => gate.name),
      ['swiftlint', 'build', 'unit-tests']
    );
    assert.deepEqual(
      plan.gates.map((gate) => gate.command),
      ['mise exec -- swiftlint lint --strict', '', '']
    );
    assert.deepEqual(
      plan.gates.map((gate) => gate.skipped),
      [null, 'when (config)', 'when (config)']
    );
    const readiness = resolveReadinessAdapter('anystack');
    assert.ok(readiness);
    assert.equal(readiness.evaluate(readiness.gather(root)).executionReady, true);
  });

  it('keeps a when-scoped gate visible as skipped and rejects unknown config keys', () => {
    const root = rootWithConfig(
      E10_SCOPED_CONFIG.replace(
        '      - id: swiftlint',
        '      - id: swiftlint\n        when: [MRCloudApp/**/*.swift]'
      )
    );
    const loaded = loadStackConfig(root, BUILTIN_GATE_IDS);
    assert.deepEqual(loaded.errors, []);
    const effective = applyStackConfig(
      [],
      pluginConfigOf(loaded.config, 'anystack'),
      'anystack',
      root,
      loaded.provenance,
      undefined,
      ['README.md']
    );
    assert.equal(effective.find((gate) => gate.id === 'swiftlint')?.skipped, 'when (gennady.yaml)');
    const skipped = runCli(root, 'sdd-verify', '--profile', 'full', '--only=swiftlint');
    assert.equal(skipped.status, 0, skipped.output);
    assert.match(skipped.output, /⏭ swiftlint .* пропущено/is);
    assert.match(skipped.output, /when \(config\)/);

    fs.writeFileSync(
      path.join(root, 'gennady.yaml'),
      E10_SCOPED_CONFIG.replace('extraGates:', 'extraGatez:')
    );
    const invalid = loadStackConfig(root, BUILTIN_GATE_IDS);
    assert.ok(invalid.errors.some((error) => error.path === 'stack.anystack.extraGatez'));
    const cliInvalid = runCli(root, 'verify', '--plan', '--json');
    assert.equal(cliInvalid.status, 4, cliInvalid.output);
    assert.match(cliInvalid.output, /stack\.anystack\.extraGatez/);
  });
});

describe('E-18 isolated Swift-primary preparation', () => {
  it('moves exact gate specs, is byte-idempotent, and never mutates the source copy', () => {
    const source = rootWithConfig();
    const isolated = rootWithConfig();
    const sourceBefore = fs.readFileSync(path.join(source, 'gennady.yaml'), 'utf-8');
    const legacy = parseYaml(sourceBefore) as {
      stack: { anystack: { extraGates: Array<Record<string, unknown>> } };
    };

    const first = prepareSwiftRoundtripFixture(isolated);
    const afterFirst = fs.readFileSync(first.path, 'utf-8');
    const second = prepareSwiftRoundtripFixture(isolated);

    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(fs.readFileSync(path.join(source, 'gennady.yaml'), 'utf-8'), sourceBefore);
    assert.equal(fs.existsSync(path.join(isolated, 'package.json')), false);
    const prepared = parseYaml(afterFirst) as {
      stack: {
        use: string[];
        anystack: { extraGates: Array<Record<string, unknown>> };
        swift: { overrideGates: Record<string, Record<string, unknown>> };
      };
    };
    assert.deepEqual(prepared.stack.use, ['swift', 'anystack']);
    assert.deepEqual(prepared.stack.anystack.extraGates, []);
    for (const [legacyId, swiftId] of [
      ['swiftlint', 'format'],
      ['build', 'build'],
      ['unit-tests', 'test'],
    ] as const) {
      const original = legacy.stack.anystack.extraGates.find((gate) => gate.id === legacyId)!;
      const { id: _id, ...literal } = original;
      const expected =
        legacyId === 'swiftlint' ? literal : { ...literal, when: [...CANONICAL_V19_SCOPE] };
      assert.deepEqual(prepared.stack.swift.overrideGates[swiftId], expected);
    }
    assert.deepEqual(prepared.stack.swift.overrideGates.build?.when, CANONICAL_V19_SCOPE);
    assert.deepEqual(prepared.stack.swift.overrideGates.test?.when, CANONICAL_V19_SCOPE);

    withFakeSwiftTools(() => {
      const loaded = loadStackConfig(isolated, BUILTIN_GATE_IDS);
      assert.deepEqual(loaded.errors, []);
      const plan = resolveAssembledFullProfile(isolated, loaded.config);
      assert.equal(plan.primary, 'swift');
      assert.deepEqual(
        plan.gates.filter((gate) => gate.primary).map((gate) => [gate.name, gate.required]),
        [
          ['format', true],
          ['build', true],
          ['test', true],
          ['lint', false],
        ]
      );
      const resolvePhase = (target: string) => {
        const ref = phaseTicket(target);
        const phasePlan = resolvePhaseVerificationPlan({
          refs: [ref],
          ticketFile: ref.file,
          phaseId: 'P1',
          scripts: {},
          availableArtifacts: new Set(),
          mode: 'runtime',
          stack: 'swift',
          config: loaded.config,
          root: isolated,
        });
        assert.ok(phasePlan);
        return phasePlan;
      };
      const docsPlan = resolvePhase('specs/app/app.spec.md');
      for (const name of ['type-check', 'test']) {
        const gate = docsPlan.gates.find((candidate) => candidate.name === name);
        assert.deepEqual(
          { state: gate?.state, command: gate?.command },
          { state: 'SKIPPED_BY_SCOPE', command: null }
        );
      }
      for (const target of ['Tools/run-tuist.sh', 'MRCloudApp/App.swift']) {
        const phasePlan = resolvePhase(target);
        for (const name of ['type-check', 'test']) {
          const gate = phasePlan.gates.find((candidate) => candidate.name === name);
          assert.equal(gate?.state, 'CONFIGURED', `${name} must run for ${target}`);
          assert.ok(gate?.command, `${name} must carry a command for ${target}`);
        }
      }
      const readiness = resolveReadinessAdapter('swift');
      assert.ok(readiness);
      assert.equal(readiness.evaluate(readiness.gather(isolated)).executionReady, true);
    });
  });

  it('fails closed when the immutable legacy contract no longer supplies all three gates', () => {
    const root = rootWithConfig(
      LEGACY_CONFIG.replace(/      - id: build[\s\S]*?        timeout: 90m\n/, '')
    );

    assert.throws(() => prepareSwiftRoundtripFixture(root), /legacy cloud-ios gates are partial/);
  });

  it('fails closed instead of replacing a conflicting Swift override', () => {
    const root = rootWithConfig(
      `${LEGACY_CONFIG}\n  swift:\n    overrideGates:\n      format:\n        cwd: MRCloudApp\n        argv: [mise, exec, --, swiftlint, lint, --strict]\n        timeout: 10m\n        fixer:\n          cwd: MRCloudApp\n          timeout: 10m\n          argv: [sh, -c, "printf '%s\\n' changed.swift | xargs swiftlint --fix"]\n      build:\n        argv: [false]\n        timeout: 1m\n      test:\n        argv: [sh, -c, "xcodebuild test -resultBundlePath build/xcresult/TestResults.xcresult"]\n        timeout: 90m\n`
    );

    assert.throws(() => prepareSwiftRoundtripFixture(root), /Swift override 'build' conflicts/);
  });
});
