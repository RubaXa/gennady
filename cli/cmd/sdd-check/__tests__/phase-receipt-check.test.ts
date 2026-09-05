// @file: Negative completion-proof tests for sdd-check phase receipt validation.
// @consumers: N/A
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatPhaseReceipt,
  phaseReceiptPlanState,
  phaseReceiptTargetState,
  phaseVerificationEnvironmentState,
  type PhaseReceipt,
  type PhaseReceiptPlan,
} from '../../../../shared/sdd/phase-receipt.ts';
import { checkPhaseReceipts } from '../phase-receipt-check.ts';

function fixture(): { root: string; path: string; content: string; plan: PhaseReceiptPlan } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-receipt-check-'));
  mkdirSync(join(root, 'specs/app'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.bin/gennady'), '');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:fix': 'prettier --write',
        'lint:fix': 'gennady lint --autofix',
        'type-check': 'tsc --noEmit',
        test: 'node --test',
        'test:coverage': 'c8 node --test',
        format: 'prettier --check .',
        lint: 'gennady lint',
        fix: 'npm run format:fix -- . && npm run lint:fix -- .',
      },
    })
  );
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;');
  writeFileSync(join(root, 'coverage-read.mjs'), 'process.exit(0);');
  writeFileSync(join(root, 'specs/app/app.spec.md'), '# spec');
  const path = join(root, 'specs/app/app.task.TSK-1.md');
  const content = [
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | impl | — | [x] |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    '  - src/a.ts',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:VERIFICATION-->',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--COVERAGE_POLICY:v1-->',
    '- **Coverage Policy:** not-applicable',
    '- **Coverage Reason:** receipt-validator fixture; production coverage is outside this unit scenario',
    '| Command | Required by | Role |',
    '|---|---|---|',
    '| — | — | extra |',
    '<!--/SECTION:VERIFICATION-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
  writeFileSync(path, content);
  const environment = phaseVerificationEnvironmentState(root, 'code', false, []);
  assert.strictEqual(environment.ok, true);
  return {
    root,
    path,
    content,
    plan: {
      ticket: 'specs/app/app.task.TSK-1.md',
      phase: 'P1',
      profile: 'code',
      profileBasis: 'phase-kind',
      targets: ['src/a.ts'],
      deletedFiles: [],
      verification: [],
      producesCoverage: false,
      environmentState: environment.ok ? environment.state : '',
    },
  };
}

function withReceipt(f: ReturnType<typeof fixture>, commands?: PhaseReceipt['commands']): string {
  const state = phaseReceiptTargetState(f.root, f.plan.targets, f.plan.deletedFiles);
  assert.strictEqual(state.ok, true);
  const receipt: PhaseReceipt = {
    schema: 1,
    ...f.plan,
    planState: phaseReceiptPlanState(f.plan),
    targetState: state.ok ? state.state : '',
    commands: commands ?? [
      { gate: 'fix', role: 'repair', command: 'npm run format:fix -- src/a.ts', exitCode: 0 },
      { gate: 'type-check', role: 'foundation', command: 'npm run type-check', exitCode: 0 },
      { gate: 'test', role: 'foundation', command: 'npm run test', exitCode: 0 },
    ],
  };
  return f.content.replace(
    '<!--/SECTION:EXECUTION_LOG-->',
    `${formatPhaseReceipt(receipt)}\n<!--/SECTION:EXECUTION_LOG-->`
  );
}

describe('checkPhaseReceipts', () => {
  it('rejects a checked phase whose schema-aware ticket has no CLI receipt', () => {
    const f = fixture();
    try {
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, f.content, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_MISSING']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('accepts complete current evidence and rejects an incomplete foundation', () => {
    const f = fixture();
    try {
      assert.deepStrictEqual(checkPhaseReceipts(f.path, f.path, withReceipt(f), f.root), []);
      const incomplete = withReceipt(f, [
        { gate: 'fix', role: 'repair', command: 'fix', exitCode: 0 },
        { gate: 'type-check', role: 'foundation', command: 'types', exitCode: 0 },
      ]);
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, incomplete, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_INCOMPLETE']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('keeps legacy receipts without per-target evidence fail-closed after a Target File changes', () => {
    const f = fixture();
    try {
      const content = withReceipt(f);
      assert.doesNotMatch(content, /"targetEvidence"/);
      writeFileSync(join(f.root, 'src/a.ts'), 'export const a = 2;');
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, content, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_TARGETS']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a receipt when its Target File is replaced by an identical in-repo symlink', () => {
    const f = fixture();
    try {
      const content = withReceipt(f);
      writeFileSync(join(f.root, 'src/identical.ts'), 'export const a = 1;');
      unlinkSync(join(f.root, 'src/a.ts'));
      symlinkSync('identical.ts', join(f.root, 'src/a.ts'));
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, content, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_TARGETS']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects evidence after the structured phase plan changes', () => {
    const f = fixture();
    try {
      const changed = withReceipt(f).replace('| P1 | impl | — | [x] |', '| P1 | test | — | [x] |');
      writeFileSync(f.path, changed);
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, changed, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_PLAN']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects evidence after a reachable ladder script body changes', () => {
    const f = fixture();
    try {
      const recorded = withReceipt(f);
      const pkgPath = join(f.root, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        scripts: Record<string, string>;
      };
      pkg.scripts.test = 'node --test --test-reporter=spec';
      writeFileSync(pkgPath, JSON.stringify(pkg));
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, recorded, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_PLAN']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('rejects evidence when the selected typecheck alias body changes', () => {
    const f = fixture();
    try {
      const pkgPath = join(f.root, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        scripts: Record<string, string>;
      };
      pkg.scripts.typecheck = pkg.scripts['type-check'] as string;
      delete pkg.scripts['type-check'];
      writeFileSync(pkgPath, JSON.stringify(pkg));
      const environment = phaseVerificationEnvironmentState(f.root, 'code', false, []);
      assert.strictEqual(environment.ok, true);
      f.plan.environmentState = environment.ok ? environment.state : '';
      const recorded = withReceipt(f).replace('npm run type-check', 'npm run typecheck');
      pkg.scripts.typecheck = 'tsc --noEmit --strict';
      writeFileSync(pkgPath, JSON.stringify(pkg));
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, recorded, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_PLAN']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('makes an existing receipt stale when the canonical coverage owner changes', () => {
    const f = fixture();
    try {
      writeFileSync(join(f.root, 'src/b.ts'), 'export const b = 1;');
      const ownerOne = f.content
        .replace('| P1 | impl | — | [x] |', '| P1 | test | — | [x] |\n| P2 | test | P1 | [ ] |')
        .replace(
          '- **Target Files:**',
          '- **Rules:**\n  - [Coverage one](COV1)\n- **Target Files:**'
        )
        .replace(
          '<!--SECTION:VERIFICATION-->',
          '<!--SECTION:PHASE_P2-->\n- **Rules:**\n  - [Coverage two](COV2)\n- **Target Files:**\n  - src/b.ts\n<!--/SECTION:PHASE_P2-->\n<!--SECTION:VERIFICATION-->'
        )
        .replace(
          [
            '<!--COVERAGE_POLICY:v1-->',
            '- **Coverage Policy:** not-applicable',
            '- **Coverage Reason:** receipt-validator fixture; production coverage is outside this unit scenario',
            '| Command | Required by | Role |',
            '|---|---|---|',
            '| — | — | extra |',
          ].join('\n'),
          '<!--COVERAGE_POLICY:v1-->\n- **Coverage Policy:** required\n- **Coverage Owner Phase:** P1\n| Command | Required by | Role |\n|---|---|---|\n| node coverage-read.mjs | COV1 | coverage |'
        );
      const plan: PhaseReceiptPlan = {
        ...f.plan,
        profile: 'test',
        coverageOwner: 'P1',
        producesCoverage: true,
        verification: [{ command: 'node coverage-read.mjs', role: 'coverage' }],
        environmentState: (() => {
          const environment = phaseVerificationEnvironmentState(f.root, 'test', true, [
            { command: 'node coverage-read.mjs' },
          ]);
          assert.strictEqual(environment.ok, true);
          return environment.ok ? environment.state : '';
        })(),
      };
      const state = phaseReceiptTargetState(f.root, plan.targets);
      assert.strictEqual(state.ok, true);
      const receipt: PhaseReceipt = {
        schema: 1,
        ...plan,
        planState: phaseReceiptPlanState(plan),
        targetState: state.ok ? state.state : '',
        commands: [
          { gate: 'fix', role: 'repair', command: 'fix', exitCode: 0 },
          { gate: 'type-check', role: 'foundation', command: 'types', exitCode: 0 },
          { gate: 'test:coverage', role: 'foundation', command: 'coverage', exitCode: 0 },
          {
            gate: 'verification',
            role: 'coverage',
            command: 'node coverage-read.mjs',
            exitCode: 0,
          },
        ],
      };
      const recorded = ownerOne.replace(
        '<!--/SECTION:EXECUTION_LOG-->',
        `${formatPhaseReceipt(receipt)}\n<!--/SECTION:EXECUTION_LOG-->`
      );
      const ownerTwo = recorded
        .replace('- **Coverage Owner Phase:** P1', '- **Coverage Owner Phase:** P2')
        .replace(
          '| node coverage-read.mjs | COV1 | coverage |',
          '| node coverage-read.mjs | COV2 | coverage |'
        );
      writeFileSync(f.path, ownerTwo);
      assert.deepStrictEqual(
        checkPhaseReceipts(f.path, f.path, ownerTwo, f.root).map((x) => x.code),
        ['SDD_PHASE_RECEIPT_STALE_PLAN']
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('grandfathers an unchanged legacy ticket without the schema marker', () => {
    const f = fixture();
    try {
      const legacy = f.content.replace('<!--PHASE_RECEIPTS:v1-->\n', '');
      assert.deepStrictEqual(checkPhaseReceipts(f.path, f.path, legacy, f.root), []);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});
