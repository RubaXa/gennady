// @file: UV-12 SDD context and optional receipt-sink contracts over one VerifyRunReport.
// @spec: CLI-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { PhaseReceipt } from '../../phase-receipt.ts';
import {
  phaseVerificationPlanEnvironmentState,
  phaseReceiptPlanState,
  phaseReceiptTargetEvidence,
  phaseReceiptTargetState,
} from '../../phase-receipt.ts';
import type { VerifyRunReport } from '../../../verify/model/verify-report.type.ts';
import type { PlannedVerifyStep } from '../../../verify/model/verify-step.type.ts';
import { emitSddReceipt, type SddReceiptCommandBinding } from '../sdd-receipt-sink.ts';
import { adaptSddVerifyContext, type SddVerifyContext } from '../sdd-verify-context.ts';

async function withProject<T>(run: (root: string) => T | Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uv12-sdd-adapter-'));
  try {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'uv12-fixture',
        private: true,
        scripts: { 'type-check': 'tsc --noEmit', lint: 'eslint src.ts' },
      })
    );
    fs.writeFileSync(path.join(root, 'src.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(root, 'verify-extra.js'), 'process.exit(0);\n');
    return await run(fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function gatePlan() {
  return {
    ticket: 'UV-12',
    phase: 'P1',
    profile: 'code' as const,
    producesCoverage: false,
    gates: [
      {
        name: 'type-check',
        state: 'CONFIGURED' as const,
        required: true,
        command: 'npm run type-check',
        prerequisites: [],
        provider: null,
        next: 'run npm run type-check',
      },
      {
        name: 'lint',
        state: 'CONFIGURED' as const,
        required: true,
        command: 'npm run lint',
        prerequisites: [],
        provider: null,
        next: 'run npm run lint',
      },
    ],
  };
}

function context(
  root: string,
  verification: readonly { readonly command: string; readonly role: string }[] = [],
  deletedFiles: readonly string[] = []
): SddVerifyContext {
  const adapted = adaptSddVerifyContext(root, {
    profile: 'code',
    profileBasis: 'phase-kind',
    targets: ['src.ts'],
    deletedFiles,
    taskPath: 'specs/app/app.task.UV-12.md',
    phaseId: 'P1',
    verification,
    producesCoverage: false,
    gatePlan: gatePlan(),
    stack: 'node',
  });
  assert.strictEqual(adapted.ok, true);
  if (!adapted.ok) throw new Error(adapted.diagnostic.message);
  return adapted.context;
}

function step(
  root: string,
  id: 'node:type-check' | 'node:lint',
  effect: 'observe' | 'repair' = 'observe'
): PlannedVerifyStep {
  return {
    id,
    plugin: 'node',
    tags: ['code'],
    needs: [],
    executor: 'local',
    effect,
    command: {
      argv: ['npm', 'run', id === 'node:type-check' ? 'type-check' : 'lint'],
      cwd: root,
      timeoutMs: 1_000,
    },
    requires: [],
    timeoutMs: 1_000,
    onFailure: 'stop-phase',
  };
}

function report(root: string, sdd: SddVerifyContext): VerifyRunReport {
  const rules = { digest: 'sha256:pre-u6', required: [], suggested: [], skipped: [] } as const;
  const steps = [step(root, 'node:type-check'), step(root, 'node:lint')];
  return {
    context: {
      request: {
        root,
        phase: 'code',
        scope: sdd.request.scope,
        task: sdd.request.task,
        sddPhase: sdd.request.sddPhase,
        deletedFiles: sdd.request.deletedFiles,
      },
      plugins: ['node'],
      frameworks: [],
      headSha: 'a'.repeat(40),
      rules,
    },
    readiness: { status: 'READY', entries: [] },
    plan: { phase: 'code', steps },
    results: steps.map((planned) => ({
      stepId: planned.id,
      plugin: planned.plugin,
      status: 'pass' as const,
      exitCode: 0,
      durationMs: 1,
      output: '',
    })),
    mutations: [],
    evidence: [],
    rules,
    verdict: 'pass',
  };
}

const BINDINGS: readonly SddReceiptCommandBinding[] = [
  { stepId: 'node:type-check', source: 'gate', gate: 'type-check' },
  { stepId: 'node:lint', source: 'gate', gate: 'lint' },
];

describe('UV-12 SDD context adapter', () => {
  it('preserves the frozen legacy receipt plan while adding immutable target request identity', () =>
    withProject((root) => {
      const adapted = context(root);
      const legacyEnvironment = phaseVerificationPlanEnvironmentState(root, gatePlan(), [], 'node');
      assert.strictEqual(legacyEnvironment.ok, true);
      if (!legacyEnvironment.ok) throw new Error(legacyEnvironment.issue);
      assert.deepStrictEqual(adapted.request, {
        task: 'specs/app/app.task.UV-12.md',
        sddPhase: 'P1',
        scope: { mode: 'files', files: ['src.ts'] },
        deletedFiles: [],
      });
      assert.deepStrictEqual(adapted.receiptPlan, {
        ticket: 'specs/app/app.task.UV-12.md',
        phase: 'P1',
        profile: 'code',
        profileBasis: 'phase-kind',
        targets: ['src.ts'],
        deletedFiles: [],
        verification: [],
        producesCoverage: false,
        environmentState: legacyEnvironment.state,
      });
      assert.ok(Object.isFrozen(adapted));
      assert.ok(Object.isFrozen(adapted.request.scope.files));
      assert.throws(() => (adapted.receiptPlan.targets as string[]).push('other.ts'));
    }));

  it('returns a typed legacy-compatible diagnostic when environment binding cannot be proven', () =>
    withProject((root) => {
      const adapted = adaptSddVerifyContext(root, {
        profile: 'code',
        profileBasis: 'phase-kind',
        targets: ['src.ts'],
        deletedFiles: [],
        taskPath: 'specs/app/app.task.UV-12.md',
        phaseId: 'P1',
        verification: [{ command: 'node missing.js', role: 'test' }],
        producesCoverage: false,
        gatePlan: gatePlan(),
        stack: 'node',
      });
      assert.strictEqual(adapted.ok, false);
      if (adapted.ok) return;
      assert.deepStrictEqual(
        {
          id: adapted.diagnostic.id,
          severity: adapted.diagnostic.severity,
          location: adapted.diagnostic.location,
        },
        {
          id: 'ERR_CLI_SDD_VERIFY_RECEIPT',
          severity: 'error',
          location: 'specs/app/app.task.UV-12.md#P1',
        }
      );
      assert.match(adapted.diagnostic.message, /missing/);
    }));
});

describe('UV-12 optional SDD receipt sink', () => {
  it('uses the exact report and frozen context commands to persist a complete receipt', () =>
    withProject(async (root) => {
      const sdd = context(root);
      const terminal = report(root, sdd);
      let persisted: PhaseReceipt | undefined;
      let persistedReport: VerifyRunReport | undefined;
      const result = await emitSddReceipt(root, terminal, sdd, BINDINGS, (receipt, source) => {
        persisted = receipt;
        persistedReport = source;
      });

      assert.strictEqual(result.ok, true);
      if (!result.ok || result.status !== 'written') return;
      assert.strictEqual(persistedReport, terminal);
      assert.strictEqual(persisted, result.receipt);
      assert.deepStrictEqual(result.receipt.commands, [
        { gate: 'type-check', role: 'foundation', command: 'npm run type-check', exitCode: 0 },
        { gate: 'lint', role: 'foundation', command: 'npm run lint', exitCode: 0 },
      ]);
      assert.strictEqual(result.receipt.planState, phaseReceiptPlanState(sdd.receiptPlan));
      assert.deepStrictEqual(
        result.receipt.gateEvidence?.map(({ name, state }) => ({ name, state })),
        [
          { name: 'type-check', state: 'PROVEN' },
          { name: 'lint', state: 'PROVEN' },
        ]
      );
      const targetState = phaseReceiptTargetState(root, ['src.ts'], []);
      const targetEvidence = phaseReceiptTargetEvidence(root, ['src.ts'], []);
      assert.strictEqual(targetState.ok, true);
      assert.strictEqual(targetEvidence.ok, true);
      if (targetState.ok) assert.strictEqual(result.receipt.targetState, targetState.state);
      if (targetEvidence.ok)
        assert.deepStrictEqual(result.receipt.targetEvidence, targetEvidence.evidence);
    }));

  it('is a true optional no-write sink when no persistence callback is configured', () =>
    withProject(async (root) => {
      const sdd = context(root);
      const result = await emitSddReceipt(root, report(root, sdd), sdd, BINDINGS);
      assert.deepStrictEqual(result, { ok: true, status: 'not-requested' });
    }));

  it('derives ticket-owned Verification command text and role from the frozen row', () =>
    withProject(async (root) => {
      const sdd = context(root, [{ command: 'node verify-extra.js', role: 'test' }]);
      const terminal = report(root, sdd);
      const verificationStep: PlannedVerifyStep = {
        ...terminal.plan.steps[0],
        id: 'node:verification-0',
        command: {
          argv: ['node', 'verify-extra.js'],
          cwd: root,
          timeoutMs: 1_000,
        },
      };
      const withVerification: VerifyRunReport = {
        ...terminal,
        plan: { ...terminal.plan, steps: [...terminal.plan.steps, verificationStep] },
        results: [
          ...terminal.results,
          {
            stepId: verificationStep.id,
            plugin: 'node',
            status: 'pass',
            exitCode: 0,
            durationMs: 1,
            output: '',
          },
        ],
      };
      const result = await emitSddReceipt(
        root,
        withVerification,
        sdd,
        [
          ...BINDINGS,
          { stepId: verificationStep.id, source: 'verification', verificationIndex: 0 },
        ],
        () => undefined
      );
      assert.strictEqual(result.ok, true);
      if (!result.ok || result.status !== 'written') return;
      assert.deepStrictEqual(result.receipt.commands.at(-1), {
        gate: 'verification',
        role: 'test',
        command: 'node verify-extra.js',
        exitCode: 0,
      });
    }));

  it('fails closed before persistence on report identity, verdict or command-proof mismatch', () =>
    withProject(async (root) => {
      const sdd = context(root);
      const cases: Array<{
        name: string;
        report: VerifyRunReport;
        bindings: readonly SddReceiptCommandBinding[];
        id: string;
      }> = [
        {
          name: 'wrong SDD phase',
          report: {
            ...report(root, sdd),
            context: {
              ...report(root, sdd).context,
              request: { ...report(root, sdd).context.request, sddPhase: 'P2' },
            },
          },
          bindings: BINDINGS,
          id: 'SDD_RECEIPT_REPORT_MISMATCH',
        },
        {
          name: 'different tombstone identity',
          report: {
            ...report(root, sdd),
            context: {
              ...report(root, sdd).context,
              request: { ...report(root, sdd).context.request, deletedFiles: ['removed.ts'] },
            },
          },
          bindings: BINDINGS,
          id: 'SDD_RECEIPT_REPORT_MISMATCH',
        },
        {
          name: 'non-pass terminal verdict',
          report: { ...report(root, sdd), verdict: 'fail' },
          bindings: BINDINGS,
          id: 'SDD_RECEIPT_REPORT_NOT_PROVEN',
        },
        {
          name: 'configured gate omitted',
          report: report(root, sdd),
          bindings: BINDINGS.slice(0, 1),
          id: 'SDD_RECEIPT_COMMAND_UNPROVEN',
        },
        {
          name: 'receipt source duplicated',
          report: report(root, sdd),
          bindings: [...BINDINGS, BINDINGS[0]],
          id: 'SDD_RECEIPT_COMMAND_UNPROVEN',
        },
        {
          name: 'passing step is rebound to a different frozen command',
          report: report(root, sdd),
          bindings: [
            { stepId: 'node:lint', source: 'gate', gate: 'type-check' },
            { stepId: 'node:type-check', source: 'gate', gate: 'lint' },
          ],
          id: 'SDD_RECEIPT_COMMAND_UNPROVEN',
        },
        {
          name: 'binding points at a waived result',
          report: {
            ...report(root, sdd),
            results: report(root, sdd).results.map((entry) =>
              entry.stepId === 'node:lint' ? { ...entry, status: 'waived' as const } : entry
            ),
          },
          bindings: BINDINGS,
          id: 'SDD_RECEIPT_COMMAND_UNPROVEN',
        },
      ];
      for (const candidate of cases) {
        let calls = 0;
        const result = await emitSddReceipt(root, candidate.report, sdd, candidate.bindings, () => {
          calls += 1;
        });
        assert.strictEqual(result.ok, false, candidate.name);
        if (result.ok) continue;
        assert.strictEqual(result.diagnostic.id, candidate.id, candidate.name);
        assert.strictEqual(result.diagnostic.severity, 'error', candidate.name);
        assert.strictEqual(
          result.diagnostic.location,
          'specs/app/app.task.UV-12.md#P1',
          candidate.name
        );
        assert.strictEqual(calls, 0, candidate.name);
      }

      const inconsistent = {
        ...sdd,
        request: { ...sdd.request, sddPhase: 'P2' },
      } satisfies SddVerifyContext;
      let inconsistentCalls = 0;
      const inconsistentResult = await emitSddReceipt(
        root,
        report(root, inconsistent),
        inconsistent,
        BINDINGS,
        () => {
          inconsistentCalls += 1;
        }
      );
      assert.strictEqual(inconsistentResult.ok, false);
      if (!inconsistentResult.ok)
        assert.strictEqual(inconsistentResult.diagnostic.id, 'SDD_RECEIPT_REPORT_MISMATCH');
      assert.strictEqual(inconsistentCalls, 0);

      const withTombstone = context(root, [], ['removed.ts']);
      const tombstoneReport = report(root, withTombstone);
      assert.deepStrictEqual(withTombstone.request.scope.files, ['removed.ts', 'src.ts']);
      assert.deepStrictEqual(tombstoneReport.context.request.deletedFiles, ['removed.ts']);
      const mismatchedTombstoneContext = context(root, [], ['other-removed.ts']);
      let tombstoneCalls = 0;
      const tombstoneResult = await emitSddReceipt(
        root,
        tombstoneReport,
        mismatchedTombstoneContext,
        BINDINGS,
        () => {
          tombstoneCalls += 1;
        }
      );
      assert.strictEqual(tombstoneResult.ok, false);
      if (!tombstoneResult.ok)
        assert.strictEqual(tombstoneResult.diagnostic.id, 'SDD_RECEIPT_REPORT_MISMATCH');
      assert.strictEqual(tombstoneCalls, 0);
    }));

  it('turns persistence failure into a typed receipt diagnostic', () =>
    withProject(async (root) => {
      const sdd = context(root);
      const result = await emitSddReceipt(root, report(root, sdd), sdd, BINDINGS, () => {
        throw new Error('disk unavailable');
      });
      assert.strictEqual(result.ok, false);
      if (result.ok) return;
      assert.strictEqual(result.diagnostic.id, 'ERR_CLI_SDD_VERIFY_RECEIPT');
      assert.match(result.diagnostic.message, /disk unavailable/);
    }));
});
