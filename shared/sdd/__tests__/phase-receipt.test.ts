// @file: Structural phase receipt parser and deterministic state tests.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatPhaseReceipt,
  parsePhaseReceipts,
  phaseReceiptPlanState,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../phase-receipt.ts';

const plan: PhaseReceiptPlan = {
  ticket: 'specs/app/app.task.TSK-1.md',
  phase: 'P1',
  profile: 'code',
  profileBasis: 'phase-kind',
  producesCoverage: false,
  targets: ['src/a.ts'],
  deletedFiles: [],
  verification: [{ command: 'npm run contract', role: 'extra' }],
  environmentState: `sha256:${'2'.repeat(64)}`,
};

function receipt(targetState = `sha256:${'1'.repeat(64)}`): PhaseReceipt {
  return {
    schema: 1,
    ...plan,
    planState: phaseReceiptPlanState(plan),
    targetState,
    commands: [
      { gate: 'fix', role: 'repair', command: 'npm run format:fix -- src/a.ts', exitCode: 0 },
      { gate: 'type-check', role: 'foundation', command: 'npm run type-check', exitCode: 0 },
      { gate: 'test', role: 'foundation', command: 'npm run test', exitCode: 0 },
      { gate: 'verification', role: 'extra', command: 'npm run contract', exitCode: 0 },
    ],
  };
}

describe('phase receipt', () => {
  it('round-trips one paired structured block', () => {
    assert.deepStrictEqual(parsePhaseReceipts(formatPhaseReceipt(receipt())), {
      ok: true,
      receipts: [receipt()],
    });
  });

  it('fails closed on malformed JSON, stray close, and duplicate phase blocks', () => {
    assert.strictEqual(parsePhaseReceipts('<!--SDD_PHASE_RECEIPT:P1-->').ok, false);
    assert.strictEqual(parsePhaseReceipts('<!--/SDD_PHASE_RECEIPT:P1-->').ok, false);
    const block = formatPhaseReceipt(receipt());
    assert.strictEqual(parsePhaseReceipts(`${block}\n${block}`).ok, false);
  });

  it('changes the target fingerprint when verified bytes change', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-'));
    try {
      writeFileSync(join(root, 'a.ts'), 'one');
      const before = phaseReceiptTargetState(root, ['a.ts']);
      writeFileSync(join(root, 'a.ts'), 'two');
      const after = phaseReceiptTargetState(root, ['a.ts']);
      assert.strictEqual(before.ok, true);
      assert.strictEqual(after.ok, true);
      if (before.ok && after.ok) assert.notStrictEqual(before.state, after.state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds deleted-file absence and fails when a tombstone reappears', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-deletion-'));
    try {
      const absent = phaseReceiptTargetState(root, [], ['old.ts']);
      assert.strictEqual(absent.ok, true);
      writeFileSync(join(root, 'old.ts'), 'returned');
      assert.strictEqual(phaseReceiptTargetState(root, [], ['old.ts']).ok, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a symlink component in explicit repo-local verification evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-evidence-symlink-'));
    try {
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts/real.mjs'), 'process.exit(0);');
      symlinkSync('real.mjs', join(root, 'scripts/alias.mjs'));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      const result = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node scripts/alias.mjs' },
      ]);
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.match(result.issue, /symlink component|is a symlink/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fingerprints transitively reachable script bodies but ignores unrelated scripts', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-environment-'));
    try {
      mkdirSync(root, { recursive: true });
      const scripts = {
        'format:fix': 'npm run formatter-leaf',
        'formatter-leaf': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        unrelated: 'echo ignored',
      };
      const writePackage = (): void =>
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      writePackage();
      const before = phaseVerificationEnvironmentState(root, 'code', false, []);
      scripts.unrelated = 'echo still ignored';
      writePackage();
      const unrelated = phaseVerificationEnvironmentState(root, 'code', false, []);
      scripts['formatter-leaf'] = 'prettier --write --changed';
      writePackage();
      const reachable = phaseVerificationEnvironmentState(root, 'code', false, []);
      assert.strictEqual(before.ok && unrelated.ok && reachable.ok, true);
      if (before.ok && unrelated.ok && reachable.ok) {
        assert.strictEqual(before.state, unrelated.state);
        assert.notStrictEqual(before.state, reachable.state);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('changes the environment fingerprint for each selected foundation or repair script body', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-selected-scripts-'));
    try {
      const baseline = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
      };
      const fingerprint = (
        scripts: Record<string, string>,
        profile: 'code' | 'test',
        producesCoverage: boolean
      ): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, profile, producesCoverage, []);
        assert.strictEqual(result.ok, true);
        return result.ok ? result.state : '';
      };

      for (const name of ['format:fix', 'lint:fix', 'test'] as const) {
        const before = fingerprint({ ...baseline }, 'code', false);
        const after = fingerprint(
          { ...baseline, [name]: `${baseline[name]} --changed` },
          'code',
          false
        );
        assert.notStrictEqual(after, before, `${name} must invalidate a code-phase receipt plan`);
      }
      const coverageBefore = fingerprint({ ...baseline }, 'test', true);
      const coverageAfter = fingerprint(
        { ...baseline, 'test:coverage': `${baseline['test:coverage']} --changed` },
        'test',
        true
      );
      assert.notStrictEqual(
        coverageAfter,
        coverageBefore,
        'test:coverage must invalidate a coverage-owner receipt plan'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fingerprints npm lifecycle hooks, shortcut commands and bounded recursive script hops', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-npm-lifecycle-'));
    try {
      const scripts: Record<string, string> = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        pretest: 'node scripts/pretest.mjs',
        test: 'node --test',
        posttest: 'node scripts/posttest.mjs',
        prestart: 'node scripts/prestart.mjs',
        start: 'npm run loop',
        poststart: 'node scripts/poststart.mjs',
        loop: 'npm run start',
        stop: 'node scripts/stop.mjs',
        restart: 'node scripts/restart.mjs',
        unrelated: 'echo ignored',
      };
      mkdirSync(join(root, 'scripts'), { recursive: true });
      for (const name of ['pretest', 'posttest', 'prestart', 'poststart', 'stop', 'restart'])
        writeFileSync(join(root, `scripts/${name}.mjs`), 'process.exit(0);');
      const fingerprint = (command = 'npm start && npm stop && npm restart'): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, 'code', false, [{ command }]);
        assert.strictEqual(result.ok, true);
        return result.ok ? result.state : '';
      };

      const before = fingerprint();
      scripts.unrelated = 'echo still ignored';
      assert.strictEqual(fingerprint(), before);
      scripts.pretest = 'node scripts/pretest.mjs --changed';
      assert.notStrictEqual(fingerprint(), before, 'npm run test executes pretest automatically');
      scripts.pretest = 'node scripts/pretest.mjs';
      scripts.posttest = 'node scripts/posttest.mjs --changed';
      assert.notStrictEqual(fingerprint(), before, 'npm run test executes posttest automatically');
      scripts.posttest = 'node scripts/posttest.mjs';
      scripts.prestart = 'node scripts/prestart.mjs --changed';
      assert.notStrictEqual(fingerprint(), before, 'npm start executes prestart automatically');
      scripts.prestart = 'node scripts/prestart.mjs';
      scripts.stop = 'node scripts/stop.mjs --changed';
      assert.notStrictEqual(fingerprint(), before, 'npm stop shortcut must be reachable');
      scripts.stop = 'node scripts/stop.mjs';
      scripts.restart = 'node scripts/restart.mjs --changed';
      assert.notStrictEqual(fingerprint(), before, 'npm restart shortcut must be reachable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('models npm restart fallback through stop/start lifecycles when restart is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-npm-restart-fallback-'));
    try {
      const scripts: Record<string, string> = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        stop: 'node scripts/stop.mjs',
        start: 'node scripts/start.mjs',
      };
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts/stop.mjs'), 'process.exit(0);');
      writeFileSync(join(root, 'scripts/start.mjs'), 'process.exit(0);');
      const fingerprint = (): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, 'code', false, [
          { command: 'npm restart' },
        ]);
        assert.strictEqual(result.ok, true);
        return result.ok ? result.state : '';
      };
      const before = fingerprint();
      scripts.start = 'node scripts/start.mjs --changed';
      assert.notStrictEqual(fingerprint(), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fingerprints npm start implicit server.js when no start script is declared', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-npm-start-default-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      writeFileSync(join(root, 'server.js'), 'process.exit(0);');
      const command = [{ command: 'npm start' }];
      const before = phaseVerificationEnvironmentState(root, 'code', false, command);
      writeFileSync(join(root, 'server.js'), 'process.exit(1);');
      const after = phaseVerificationEnvironmentState(root, 'code', false, command);
      assert.strictEqual(before.ok && after.ok, true);
      if (before.ok && after.ok) assert.notStrictEqual(before.state, after.state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fingerprints the actually selected typecheck alias and direct repo-local command inputs', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-provenance-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      const scripts = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        typecheck: 'tsc --noEmit',
        test: 'node --test',
      };
      writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      writeFileSync(join(root, 'scripts/check.mjs'), 'process.exit(0);');
      const before = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node scripts/check.mjs' },
      ]);
      scripts.typecheck = 'tsc --noEmit --strict';
      writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      const aliasChanged = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node scripts/check.mjs' },
      ]);
      scripts.typecheck = 'tsc --noEmit';
      writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      writeFileSync(join(root, 'scripts/check.mjs'), 'process.exit(1);');
      const inputChanged = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node scripts/check.mjs' },
      ]);
      assert.strictEqual(before.ok && aliasChanged.ok && inputChanged.ok, true);
      if (before.ok && aliasChanged.ok && inputChanged.ok) {
        assert.notStrictEqual(before.state, aliasChanged.state);
        assert.notStrictEqual(before.state, inputChanged.state);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds npm, pnpm and yarn forwarded config operands to the environment state', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-forwarded-config-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'configs'));
      writeFileSync(join(root, 'scripts/check.mjs'), 'process.exit(0);');
      writeFileSync(join(root, 'configs/tool.json'), '{"mode":"one"}');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
            verify: 'node scripts/check.mjs',
          },
        })
      );
      const fingerprint = (manager: 'npm' | 'pnpm' | 'yarn'): string => {
        const result = phaseVerificationEnvironmentState(root, 'code', false, [
          { command: `${manager} run verify -- --config configs/tool.json` },
        ]);
        assert.strictEqual(result.ok, true, result.ok ? undefined : result.issue);
        return result.ok ? result.state : '';
      };
      const before = new Map(
        (['npm', 'pnpm', 'yarn'] as const).map((manager) => [manager, fingerprint(manager)])
      );
      writeFileSync(join(root, 'configs/tool.json'), '{"mode":"two"}');
      for (const manager of ['npm', 'pnpm', 'yarn'] as const) {
        assert.notStrictEqual(
          fingerprint(manager),
          before.get(manager),
          `${manager} forwarded config bytes must invalidate the receipt`
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds a backslash-escaped whitespace path forwarded to a package script', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-forwarded-space-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'configs'));
      writeFileSync(join(root, 'scripts/check.mjs'), 'process.exit(0);');
      writeFileSync(join(root, 'configs/tool config.json'), '{"mode":"one"}');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
            verify: 'node scripts/check.mjs',
          },
        })
      );
      const escaped = [{ command: 'npm run verify -- --config configs/tool\\ config.json' }];
      const quoted = [{ command: 'npm run verify -- --config "configs/tool config.json"' }];
      const escapedBefore = phaseVerificationEnvironmentState(root, 'code', false, escaped);
      const quotedBefore = phaseVerificationEnvironmentState(root, 'code', false, quoted);
      writeFileSync(join(root, 'configs/tool config.json'), '{"mode":"two"}');
      const escapedAfter = phaseVerificationEnvironmentState(root, 'code', false, escaped);
      const quotedAfter = phaseVerificationEnvironmentState(root, 'code', false, quoted);
      assert.strictEqual(
        escapedBefore.ok && quotedBefore.ok && escapedAfter.ok && quotedAfter.ok,
        true
      );
      if (escapedBefore.ok && quotedBefore.ok && escapedAfter.ok && quotedAfter.ok) {
        assert.notStrictEqual(escapedBefore.state, escapedAfter.state);
        assert.notStrictEqual(quotedBefore.state, quotedAfter.state);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed on malformed quoted or escaped package-script argv', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-malformed-argv-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
            verify: 'node --test',
          },
        })
      );
      for (const command of [
        'npm run verify -- --config "configs/tool.json',
        'npm run verify -- --config configs/tool.json\\',
      ]) {
        const result = phaseVerificationEnvironmentState(root, 'code', false, [{ command }]);
        assert.strictEqual(result.ok, false, command);
        if (!result.ok)
          assert.match(result.issue, /unterminated shell quote|trailing shell escape/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds every node --test operand so a change in the second file invalidates the environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-node-test-operands-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      writeFileSync(join(root, 'a.test.js'), 'export const a = 1;');
      writeFileSync(join(root, 'b.test.js'), 'export const b = 1;');
      const verification = [
        { command: 'node --test --test-name-pattern smoke a.test.js b.test.js' },
      ];
      const before = phaseVerificationEnvironmentState(root, 'code', false, verification);
      writeFileSync(join(root, 'b.test.js'), 'export const b = 2;');
      const after = phaseVerificationEnvironmentState(root, 'code', false, verification);
      assert.strictEqual(before.ok && after.ok, true);
      if (before.ok && after.ok) assert.notStrictEqual(before.state, after.state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects dynamic and unknown runners instead of claiming complete binding', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-unbound-inputs-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      writeFileSync(join(root, 'a.test.js'), 'export const a = 1;');
      const unknown = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'mystery-runner a.test.js' },
      ]);
      const dynamic = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node --test ${TEST_FILE}' },
      ]);
      assert.strictEqual(unknown.ok, false);
      assert.strictEqual(dynamic.ok, false);
      if (!unknown.ok)
        assert.match(unknown.issue, /runner mystery-runner has no receipt input adapter/);
      if (!dynamic.ok) assert.match(dynamic.issue, /dynamic shell expansion is unsupported/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects inline/module execution even when argv exposes no local operand', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-inline-boundary-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      writeFileSync(join(root, 'a.test.js'), 'export const a = 1;');
      for (const command of [
        'node -e "require(\'./config.js\')"',
        'node --eval "process.exit(0)"',
        'node -p "process.cwd()"',
        'python -m local_checks',
        'sh -c "node scripts/check.mjs"',
      ]) {
        const result = phaseVerificationEnvironmentState(root, 'code', false, [{ command }]);
        assert.strictEqual(result.ok, false, command);
        if (!result.ok) assert.match(result.issue, /inline\/module execution is unsupported/);
      }
      const unknownNoPath = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'mystery-runner --mode smoke' },
      ]);
      assert.strictEqual(unknownNoPath.ok, false);
      if (!unknownNoPath.ok)
        assert.match(unknownNoPath.issue, /runner mystery-runner has no receipt input adapter/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips declared non-path flag values while binding repo-local option and Go operands', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-declarative-operands-'));
    try {
      mkdirSync(join(root, 'config'));
      mkdirSync(join(root, 'cmd'));
      writeFileSync(join(root, 'config/test.env'), 'MODE=test');
      writeFileSync(join(root, 'a.test.js'), 'export const a = 1;');
      writeFileSync(join(root, 'cmd/a.go'), 'package main');
      writeFileSync(join(root, 'cmd/b.go'), 'package main');
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      const verification = [
        {
          command:
            'node --env-file config/test.env --test --test-name-pattern not-a-path a.test.js',
        },
        { command: 'go run cmd/a.go cmd/b.go -- runtime-argument' },
      ];
      const before = phaseVerificationEnvironmentState(root, 'code', false, verification);
      writeFileSync(join(root, 'config/test.env'), 'MODE=changed');
      const flagInputChanged = phaseVerificationEnvironmentState(root, 'code', false, verification);
      writeFileSync(join(root, 'config/test.env'), 'MODE=test');
      writeFileSync(join(root, 'cmd/b.go'), 'package main\nfunc main() {}');
      const after = phaseVerificationEnvironmentState(root, 'code', false, verification);
      assert.strictEqual(before.ok && flagInputChanged.ok && after.ok, true);
      if (before.ok && flagInputChanged.ok && after.ok) {
        assert.notStrictEqual(before.state, flagInputChanged.state);
        assert.notStrictEqual(before.state, after.state);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds the exact tsc --project config file, including a directory-valued project', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-tsc-project-'));
    try {
      mkdirSync(join(root, 'config'));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
      writeFileSync(join(root, 'config/tsconfig.json'), '{"compilerOptions":{"strict":true}}');
      const explicit = [{ command: 'tsc --project tsconfig.json' }];
      const directory = [{ command: 'tsc -p config' }];
      const explicitBefore = phaseVerificationEnvironmentState(root, 'code', false, explicit);
      const directoryBefore = phaseVerificationEnvironmentState(root, 'code', false, directory);
      writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":false}}');
      const explicitAfter = phaseVerificationEnvironmentState(root, 'code', false, explicit);
      writeFileSync(join(root, 'config/tsconfig.json'), '{"compilerOptions":{"strict":false}}');
      const directoryAfter = phaseVerificationEnvironmentState(root, 'code', false, directory);
      assert.strictEqual(
        explicitBefore.ok && explicitAfter.ok && directoryBefore.ok && directoryAfter.ok,
        true
      );
      if (explicitBefore.ok && explicitAfter.ok && directoryBefore.ok && directoryAfter.ok) {
        assert.notStrictEqual(explicitBefore.state, explicitAfter.state);
        assert.notStrictEqual(directoryBefore.state, directoryAfter.state);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fingerprints a Python script after ordinary value-taking runner options', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-python-options-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      const command = [{ command: 'python -W ignore scripts/check.py' }];
      writeFileSync(join(root, 'scripts/check.py'), 'raise SystemExit(0)');
      const passing = phaseVerificationEnvironmentState(root, 'code', false, command);
      writeFileSync(join(root, 'scripts/check.py'), 'raise SystemExit(1)');
      const failing = phaseVerificationEnvironmentState(root, 'code', false, command);
      assert.strictEqual(passing.ok && failing.ok, true);
      if (passing.ok && failing.ok) assert.notStrictEqual(passing.state, failing.state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('follows only the declared npm, pnpm and yarn run forms transitively', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-run-forms-'));
    try {
      const scripts = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'pnpm run suite',
        suite: 'yarn run leaf',
        leaf: 'npm run-script final',
        final: 'node --test',
      };
      writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      const before = phaseVerificationEnvironmentState(root, 'code', false, []);
      scripts.final = 'node --test --test-reporter=spec';
      writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
      const after = phaseVerificationEnvironmentState(root, 'code', false, []);
      assert.strictEqual(before.ok && after.ok, true);
      if (before.ok && after.ok) assert.notStrictEqual(before.state, after.state);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds supported package-manager option placement to the selected script transitively', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-manager-options-'));
    try {
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts/a.js'), 'export const value = "a";');
      writeFileSync(join(root, 'scripts/b.js'), 'export const value = "b";');
      writeFileSync(join(root, 'scripts/pre-a.js'), 'export const pre = "a";');
      writeFileSync(join(root, 'scripts/pre-b.js'), 'export const pre = "b";');
      const scripts: Record<string, string> = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        precustom: 'node scripts/pre-a.js',
        custom: 'node scripts/a.js',
      };
      const commands = [
        'npm --silent run custom',
        'npm --prefix . run custom',
        'npm run --silent custom',
        'pnpm --silent run custom',
        'pnpm --dir . run custom',
        'pnpm run --silent custom',
        'yarn --silent run custom',
        'yarn --cwd . run custom',
        'yarn run --silent custom',
      ];
      const fingerprint = (command: string): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, 'code', false, [{ command }]);
        assert.strictEqual(result.ok, true, result.ok ? '' : result.issue);
        return result.ok ? result.state : '';
      };

      for (const command of commands) {
        scripts.custom = 'node scripts/a.js';
        const before = fingerprint(command);
        scripts.custom = 'node scripts/b.js';
        const changedHop = fingerprint(command);
        assert.notStrictEqual(changedHop, before, `${command} must bind the selected script body`);
        writeFileSync(join(root, 'scripts/b.js'), `// changed by ${command}\n`);
        const changedInput = fingerprint(command);
        assert.notStrictEqual(
          changedInput,
          changedHop,
          `${command} must bind the selected script input`
        );
        scripts.precustom = 'node scripts/pre-b.js';
        const changedLifecycle = fingerprint(command);
        assert.notStrictEqual(
          changedLifecycle,
          changedInput,
          `${command} must conservatively bind lifecycle hooks`
        );
        scripts.precustom = 'node scripts/pre-a.js';
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed on unsupported package-manager options and non-root selectors', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-manager-options-red-'));
    try {
      mkdirSync(join(root, 'packages/app'), { recursive: true });
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
            custom: 'node --test',
          },
        })
      );
      for (const command of [
        'npm --workspace app run custom',
        'npm --prefix packages/app run custom',
        'pnpm --filter app run custom',
        'pnpm --dir packages/app run custom',
        'yarn --immutable run custom',
        'yarn --cwd packages/app run custom',
        'npm exec custom-tool',
        'npm --silent run absent',
        'npx npm run custom',
        'c8 npm run custom',
        'npm run custom -- --config configs/tool' + '\\',
      ]) {
        const result = phaseVerificationEnvironmentState(root, 'code', false, [{ command }]);
        assert.strictEqual(result.ok, false, `${command} must fail closed`);
        if (!result.ok)
          assert.match(
            result.issue,
            /unsupported|only the project-root package|missing project script|trailing shell escape/
          );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('follows declared yarn/pnpm shortcuts, ignores unrelated scripts and excludes builtins', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-shortcuts-'));
    try {
      const scripts: Record<string, string> = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        yarnSuite: 'node scripts/yarn-suite.mjs',
        pnpmSuite: 'node scripts/pnpm-suite.mjs',
        install: 'echo declared-but-manager-owned',
        add: 'echo declared-but-manager-owned',
        unrelated: 'echo ignored',
      };
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(join(root, 'scripts/yarn-suite.mjs'), 'process.exit(0);');
      writeFileSync(join(root, 'scripts/pnpm-suite.mjs'), 'process.exit(0);');
      const commands = [
        { command: 'yarn yarnSuite' },
        { command: 'pnpm pnpmSuite' },
        { command: 'yarn install && pnpm add' },
      ];
      const fingerprint = (): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, 'code', false, commands);
        assert.strictEqual(result.ok, true);
        return result.ok ? result.state : '';
      };

      const before = fingerprint();
      scripts.unrelated = 'echo still ignored';
      assert.strictEqual(fingerprint(), before);
      scripts.install = 'echo changed builtin';
      scripts.add = 'echo changed builtin';
      assert.strictEqual(fingerprint(), before);
      scripts.yarnSuite = 'node scripts/yarn-suite.mjs --changed';
      assert.notStrictEqual(fingerprint(), before);
      scripts.yarnSuite = 'node scripts/yarn-suite.mjs';
      scripts.pnpmSuite = 'node scripts/pnpm-suite.mjs --changed';
      assert.notStrictEqual(fingerprint(), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still follows an explicitly requested script whose name is also a manager builtin', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-explicit-builtin-script-'));
    try {
      const scripts: Record<string, string> = {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        install: 'echo before',
      };
      const fingerprint = (): string => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
        const result = phaseVerificationEnvironmentState(root, 'code', false, [
          { command: 'yarn run install' },
        ]);
        assert.strictEqual(result.ok, true);
        return result.ok ? result.state : '';
      };
      const before = fingerprint();
      scripts.install = 'echo after';
      assert.notStrictEqual(fingerprint(), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails teachingly when an obvious repo-local verification input is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-receipt-missing-input-'));
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: {
            'format:fix': 'prettier --write',
            'lint:fix': 'gennady lint --autofix',
            'type-check': 'tsc --noEmit',
            test: 'node --test',
          },
        })
      );
      const result = phaseVerificationEnvironmentState(root, 'code', false, [
        { command: 'node scripts/missing-check.mjs' },
      ]);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.issue, /cannot fingerprint an explicit repo-local verification input/);
        assert.match(result.issue, /scripts\/missing-check\.mjs/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
