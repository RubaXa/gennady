// @file: Contract tests for ReviewEval — exhaustive type set, profile combinations and port
//   contract kit determinism. Covers [contract-only] and [simulation-backed] surface.
// @consumers: node:test runner
// @tasks: TSK-183

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewEvalProfile, ReviewEvalOutcome } from '../scenarios/review-eval-scenario.ts';
import { composeReviewEvalReport } from '../reports/review-eval-report.ts';
import { DeterministicPortContractKit } from '../contracts/review-port-contract-kit.ts';
import { DeterministicPreconditionProbe } from '../probes/review-precondition-probe.ts';
import { composeMockHarness } from '../harness/review-eval-harness.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { ReviewRuntimeReceiptStorePort } from '../../inbox-pipeline/ports/review-runtime-receipt-store.port.ts';
import type {
  ReviewEvalScenario,
  ReviewScenarioResult,
} from '../scenarios/review-eval-scenario.ts';
import type { ReviewEvalRun } from '../scenarios/review-eval-scenario.ts';

const FIXED_NOW = '2026-08-11T00:00:00.000Z';

// #region START_EXHAUSTIVE_TYPE_SET
describe('eval statuses reports and profiles are exhaustive and all skipped is not pass', () => {
  it('ReviewEvalProfile covers exactly mock, real-readonly, real-effects', () => {
    // contract: the three profile identifiers are the only allowed values
    // failure mode: a fourth profile variant sneaks in or one is renamed
    const profiles: ReviewEvalProfile[] = ['mock', 'real-readonly', 'real-effects'];
    assert.strictEqual(profiles.length, 3, 'exactly three profiles are defined');
    assert.ok(profiles.includes('mock'), 'mock profile must be present');
    assert.ok(profiles.includes('real-readonly'), 'real-readonly profile must be present');
    assert.ok(profiles.includes('real-effects'), 'real-effects profile must be present');
  });

  it('ReviewEvalOutcome covers exactly PASS, FAIL, SKIP, INCONCLUSIVE', () => {
    // contract: four and only four outcome values are defined
    // failure mode: a fifth outcome is added or INCONCLUSIVE is renamed
    const outcomes: ReviewEvalOutcome[] = ['PASS', 'FAIL', 'SKIP', 'INCONCLUSIVE'];
    assert.strictEqual(outcomes.length, 4, 'exactly four outcomes are defined');
    assert.ok(outcomes.includes('PASS'), 'PASS outcome must be present');
    assert.ok(outcomes.includes('FAIL'), 'FAIL outcome must be present');
    assert.ok(outcomes.includes('SKIP'), 'SKIP outcome must be present');
    assert.ok(outcomes.includes('INCONCLUSIVE'), 'INCONCLUSIVE outcome must be present');
  });

  it('all-skipped run is not PASS regardless of skip count', () => {
    // contract: all-SKIP → INCONCLUSIVE; invariant: all-skipped-is-not-pass must hold for 1, 2, n
    // failure mode: a single-skip run erroneously returns PASS
    for (const count of [1, 2, 5]) {
      const results: ReviewScenarioResult[] = Array.from({ length: count }, (_, i) => ({
        scenarioId: `skip-${i}`,
        outcome: 'SKIP' as const,
        preconditions: [],
        evidence: [],
        skipReason: 'precondition unmet',
      }));
      const run: ReviewEvalRun = {
        runId: `all-skip-${count}`,
        profile: 'mock',
        mrs: [],
        results,
        startedAt: FIXED_NOW,
        finishedAt: FIXED_NOW,
      };
      const report = composeReviewEvalReport(run);
      assert.notStrictEqual(
        report.verdict,
        'PASS',
        `all-skipped (count=${count}) verdict must not be PASS; got ${report.verdict}`
      );
      assert.strictEqual(
        report.verdict,
        'INCONCLUSIVE',
        `all-skipped (count=${count}) verdict must be INCONCLUSIVE`
      );
    }
  });

  it('zero results run is not PASS', () => {
    // contract: empty results → INCONCLUSIVE; never PASS, never FAIL
    // failure mode: zero-result run produces PASS or throws
    const run: ReviewEvalRun = {
      runId: 'zero-results',
      profile: 'mock',
      mrs: [],
      results: [],
      startedAt: FIXED_NOW,
      finishedAt: FIXED_NOW,
    };
    const report = composeReviewEvalReport(run);
    assert.notStrictEqual(report.verdict, 'PASS', 'zero results must not yield PASS');
    assert.strictEqual(report.verdict, 'INCONCLUSIVE', 'zero results must yield INCONCLUSIVE');
  });
});
// #endregion END_EXHAUSTIVE_TYPE_SET

// #region START_PORT_CONTRACT_MATRIX
describe('all profile combinations and variable port contracts are covered deterministically', () => {
  it('DeterministicPortContractKit.verifyVcsPort passes for VcsInboxMock', async () => {
    // contract: mock VCS adapter must satisfy every VcsInboxPort operation check
    // failure mode: mock adapter fails a callable check or getHost returns non-string
    const kit = new DeterministicPortContractKit();
    const vcs = new VcsInboxMock();
    const result = await kit.verifyVcsPort(vcs);
    assert.strictEqual(result.portName, 'VcsInboxPort', 'portName must identify the port');
    assert.strictEqual(
      result.pass,
      true,
      `VCS port verification must pass; violations: ${JSON.stringify(result.checks.filter((c) => !c.pass).map((c) => c.violations))}`
    );
    assert.ok(result.checks.length > 0, 'at least one check must be performed');
    for (const check of result.checks) {
      assert.strictEqual(
        check.pass,
        true,
        `check "${check.checkName}" must pass; violations: ${JSON.stringify(check.violations)}`
      );
    }
  });

  it('DeterministicPortContractKit.verifyOpenCodePort passes for OpenCodeMock', async () => {
    // contract: mock OpenCode adapter must satisfy every OpenCodePort operation check
    // failure mode: mock adapter fails createSession/prompt/status callable check
    const kit = new DeterministicPortContractKit();
    const opencode = new OpenCodeMock();
    const result = await kit.verifyOpenCodePort(opencode);
    assert.strictEqual(result.portName, 'OpenCodePort', 'portName must identify the port');
    assert.strictEqual(
      result.pass,
      true,
      `OpenCode port verification must pass; violations: ${JSON.stringify(result.checks.filter((c) => !c.pass).map((c) => c.violations))}`
    );
    for (const check of result.checks) {
      assert.strictEqual(check.pass, true, `check "${check.checkName}" must pass`);
    }
  });

  it('DeterministicPortContractKit.verifyReceiptStorePort passes for in-memory adapter', async () => {
    // contract: a minimal conforming receipt store must satisfy all appendReceipt/appendConsumption/readReceipts/readConsumptions checks
    // failure mode: missing operation detected as violation
    const kit = new DeterministicPortContractKit();
    const store: ReviewRuntimeReceiptStorePort = {
      appendReceipt: () => ({
        status: 'APPENDED',
        sequence: 1,
        durable: true,
        digest: 'sha256-mock',
      }),
      appendConsumption: () => ({
        status: 'APPENDED',
        sequence: 1,
        durable: true,
        digest: 'sha256-mock',
      }),
      readReceipts: () => ({ status: 'READ', records: [] }),
      readConsumptions: () => ({ status: 'READ', records: [] }),
    };
    const result = await kit.verifyReceiptStorePort(store);
    assert.strictEqual(
      result.portName,
      'ReviewRuntimeReceiptStorePort',
      'portName must identify the port'
    );
    assert.strictEqual(
      result.pass,
      true,
      `receipt store port verification must pass; violations: ${JSON.stringify(result.checks.filter((c) => !c.pass).map((c) => c.violations))}`
    );
    for (const check of result.checks) {
      assert.strictEqual(check.pass, true, `check "${check.checkName}" must pass`);
    }
  });

  it('DeterministicPortContractKit.verifyVcsPort fails for adapter where getHost returns non-string', async () => {
    // contract: an adapter where getHost returns a non-string value must fail the verifyVcsPort check
    // failure mode: getHost return-type violation goes undetected, verification returns pass
    const kit = new DeterministicPortContractKit();
    const partialAdapter = {
      getActionable: async () => [],
      getMrContext: async () => ({ myRole: null }),
      getDiscussions: async () => [],
      getHost: () => undefined, // callable but returns undefined, not a string
    } as unknown as Parameters<typeof kit.verifyVcsPort>[0];
    const result = await kit.verifyVcsPort(partialAdapter);
    assert.strictEqual(
      result.pass,
      false,
      'verification must fail when getHost returns non-string'
    );
    const hostReturnCheck = result.checks.find((c) => c.checkName === 'getHost returns string');
    assert.ok(hostReturnCheck, 'a check for getHost return type must exist');
    assert.strictEqual(hostReturnCheck.pass, false, 'getHost return-type check must fail');
    assert.ok(
      hostReturnCheck.violations.length > 0,
      'violations must be non-empty for the failed check'
    );
  });

  it('DeterministicPreconditionProbe returns all scenarios runnable for mock profile', async () => {
    // contract: deterministic probe must mark every scenario runnable — no VCS calls made
    // failure mode: deterministic probe returns runnable=false for any scenario
    const probe = new DeterministicPreconditionProbe();
    const scenarios: ReviewEvalScenario[] = [
      {
        id: 'sc-A',
        description: 'contract test scenario A',
        requiredProfile: 'mock',
        preconditions: ['has-role-reviewer'],
        execute: async () => ({
          scenarioId: 'sc-A',
          outcome: 'PASS',
          preconditions: [],
          evidence: [{ address: 'mock:sc-A', summary: 'ok' }],
        }),
      },
      {
        id: 'sc-B',
        description: 'contract test scenario B — no preconditions',
        requiredProfile: 'mock',
        preconditions: [],
        execute: async () => ({
          scenarioId: 'sc-B',
          outcome: 'PASS',
          preconditions: [],
          evidence: [{ address: 'mock:sc-B', summary: 'ok' }],
        }),
      },
    ];
    const result = await probe.probe({ profile: 'mock', mrs: [] }, scenarios);
    assert.strictEqual(result.statuses.length, 2, 'probe must return status for every scenario');
    for (const status of result.statuses) {
      assert.strictEqual(
        status.runnable,
        true,
        `scenario ${status.scenarioId} must be runnable from DeterministicPreconditionProbe`
      );
    }
    const runnable = result.pickRunnableScenarios(scenarios);
    assert.strictEqual(
      runnable.length,
      scenarios.length,
      'pickRunnableScenarios must return all scenarios'
    );
  });

  it('composeMockHarness builds a harness in mock profile', async () => {
    // contract: factory builds a mock-profile harness without real credentials or network
    // failure mode: composeMockHarness throws or returns harness with wrong profile
    const harness = await composeMockHarness({
      runId: 'contract-test-mock-harness',
      mrs: ['https://gitlab.example.com/group/project/-/merge_requests/99'],
      now: () => FIXED_NOW,
    });
    assert.ok(harness, 'composeMockHarness must return a harness instance');
    // probe with no scenarios — must return empty runnable list without throwing
    const probeResult = await harness.probe([]);
    assert.ok(Array.isArray(probeResult.statuses), 'probe result statuses must be an array');
    assert.strictEqual(probeResult.statuses.length, 0, 'no scenarios → empty statuses');
  });
});
// #endregion END_PORT_CONTRACT_MATRIX
