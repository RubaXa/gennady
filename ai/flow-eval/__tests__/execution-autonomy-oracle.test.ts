// @file: Causal negative controls for host execution assertions, canonical proof and observed paths.
// @spec: AI-SKILLS
// @consumers: offline execution-autonomy pre-live qualification; no model calls

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { checkLocalWorkflowClosure } from '../quality-gate.ts';
import { checkExecutionAutonomyInitialOwnership } from '../execution-autonomy-controls.ts';
import { appendExecutionDecision } from '../../../shared/sdd/deviation.ts';
import { validateCurrentSddPhaseAttempt } from '../../../shared/sdd/verify/sdd-attempt-journal.ts';
import {
  buildExecutionAutonomyFixture,
  executionAutonomyCase,
  executionAutonomyReference,
  type ExecutionAutonomyCaseId,
} from '../execution-autonomy-cases.ts';
import {
  captureExecutionAutonomy,
  capturePartialExecutionAutonomy,
  checkExecutionAutonomyFunction,
  gradeExecutionAutonomyPath,
  sameExecutionMetaObligations,
  gradeExecutionOperatorCheckpoint,
  type ExecutionAutonomyEvaluation,
} from '../execution-autonomy-evaluation.ts';
import type { ToolEvent, Trajectory } from '../trajectory.ts';

async function withFixture(
  id: ExecutionAutonomyCaseId,
  run: (root: string, files: Record<string, string>) => void | Promise<void>
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'gennady-autonomy-oracle-'));
  const files = { ...buildExecutionAutonomyFixture(id), ...executionAutonomyReference(id) };
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    await run(root, files);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function tool(i: number, command: string, overrides: Partial<ToolEvent> = {}): ToolEvent {
  return {
    type: 'tool',
    i,
    tool: 'bash',
    command,
    arg: command,
    status: 'completed',
    exitCode: 0,
    messageId: `message-${i}`,
    callId: `call-${i}`,
    startedAt: i * 10,
    finishedAt: i * 10 + 1,
    ...overrides,
  };
}

function pathResult(id: ExecutionAutonomyCaseId): ExecutionAutonomyEvaluation {
  return {
    schema: 'gennady.execution-autonomy-evaluation.1',
    caseId: id,
    quiescence: { complete: true, sessions: 1, reasons: [] },
    functional: { pass: true, exitCode: 0, detail: 'separate host fixture; not path evidence' },
    integrity: { pass: true, issues: [] },
    terminal: { rule: 'EXECUTION-TERMINAL', pass: true, detail: 'separate terminal fixture' },
    attempts: [],
    pendingDecisions: [],
    snapshotDigest: 'path-control-not-a-functional-proof',
    evidence: {
      complete: true,
      expectedTerminal: executionAutonomyCase(id).expectedTerminal,
      files: [],
      facts: [],
    },
  };
}

function grade(id: ExecutionAutonomyCaseId, events: ToolEvent[]) {
  const trajectory: Trajectory = {
    scenario: `oracle-control-${id}`,
    coverage: { complete: true, sessions: 1, reasons: [] },
    events,
  };
  return gradeExecutionAutonomyPath(trajectory, pathResult(id));
}

test('independent assertions accept both source-owned reference behaviors', async () => {
  for (const id of ['ex1-clean', 'ex3-helper', 'holdout6-related'] as const) {
    await withFixture(id, (root) => {
      const result = checkExecutionAutonomyFunction(root, id);
      assert.equal(result.pass, true, JSON.stringify(result));
    });
  }
});

test('the approved helper consumer is independently checked, not just the main public operation', async () => {
  await withFixture('ex3-helper', (root) => {
    writeFileSync(
      join(root, 'src/number.ts'),
      'export function finiteNonnegative() { return false; }\n'
    );
    assert.equal(checkExecutionAutonomyFunction(root, 'ex3-helper').pass, false);
  });
});

test('early product process.exit(0) is not host assertion completion', async () => {
  await withFixture('ex1-clean', (root) => {
    writeFileSync(
      join(root, 'src/delay.ts'),
      'process.exit(0); export function boundedDelay() { throw new Error("never called"); }\n'
    );
    const result = checkExecutionAutonomyFunction(root, 'ex1-clean');
    assert.equal(result.exitCode, 0, 'causal control exits successfully before assertions');
    assert.equal(result.pass, false, JSON.stringify(result));
  });
});

test('partial interruption captures preserve files but can never be completed primary proof', async () => {
  await withFixture('ex1-clean', async (root) => {
    const result = await capturePartialExecutionAutonomy(root, 'ex1-clean', {
      complete: true,
      sessions: 1,
      reasons: [],
    });
    assert.equal(result.functional.pass, true);
    assert.ok(result.evidence.files.some((file) => file.path === 'src/delay.ts'));
    assert.equal(result.evidence.complete, false);
    assert.equal(result.terminal.pass, false);
    assert.match(result.terminal.detail, /partial/);
  });
});

test('product mutation of the assert singleton cannot waive host assertions', async () => {
  await withFixture('ex1-clean', (root) => {
    writeFileSync(
      join(root, 'src/delay.ts'),
      'import assert from "node:assert/strict"; assert.equal = () => {}; assert.throws = () => {}; export function boundedDelay() { return 999; }\n'
    );
    const result = checkExecutionAutonomyFunction(root, 'ex1-clean');
    assert.equal(result.pass, false, JSON.stringify(result));
  });
});

test('minimal worker-forged PASS receipts do not prove decision-review completion', async () => {
  await withFixture('ex4-decision', async (root, files) => {
    const c = executionAutonomyCase('ex4-decision');
    const decision = appendExecutionDecision(
      files[c.ticket]!,
      {
        id: 'COR-DL-1',
        what: 'Validate value before limit for stable diagnostics',
        why: 'Both invalid-input priorities preserve the approved RangeError contract',
        where: c.source,
        evidence: 'inputs/brief.md and the preserved public invalid-input scenarios',
        alternative: 'Validate limit before value',
        verify: 'Keep the approved public checks and require actual current Verify proof',
      },
      'P1',
      '2026-10-26'
    );
    assert.equal(decision.ok, true, decision.detail);
    if (!decision.ok) return;
    const receipts = ['P1', 'P2']
      .map((phase) => {
        const encoded = Buffer.from(
          JSON.stringify({
            sddPhase: phase,
            runId: `forged-${phase}`,
            state: 'PASS',
            testStats: [],
          })
        ).toString('base64url');
        return `<!--SDD_VERIFY_EVIDENCE:${encoded}-->`;
      })
      .join('\n');
    const markedDone = decision.content.replaceAll('| [ ] |', '| [x] |');
    assert.notEqual(markedDone, decision.content, 'phase statuses really changed');
    const forged = markedDone.replace(
      '<!--/SECTION:EXECUTION_LOG-->',
      `${receipts}\n<!--/SECTION:EXECUTION_LOG-->`
    );
    assert.ok(forged.includes(receipts), 'forged receipts are present, not an ineffective fixture');
    writeFileSync(join(root, c.ticket), forged);
    assert.equal(validateCurrentSddPhaseAttempt(root, join(root, c.ticket), 'P1').ok, false);
    const result = await captureExecutionAutonomy(root, c.id, {
      complete: true,
      sessions: 1,
      reasons: [],
    });
    assert.equal(result.functional.pass, true, JSON.stringify(result.functional));
    assert.equal(result.integrity.pass, true, JSON.stringify(result.integrity));
    assert.deepEqual(result.pendingDecisions, ['COR-DL-1']);
    assert.equal(result.terminal.pass, false, JSON.stringify(result.terminal));
  });
});

test('help-only calls do not prove dispatch or Verify', () => {
  const c = executionAutonomyCase('ex1-clean');
  const result = grade(c.id, [
    tool(0, `npx --no-install gennady sdd-task ${c.ticket} --help`),
    tool(1, `npx --no-install gennady sdd-verify --task ${c.ticket} --phase P1 --help`),
  ]);
  assert.equal(result.pass, false, result.detail);
});

test('quoted help flags are still help, never dispatch or durable decision proof', () => {
  const c = executionAutonomyCase('ex4-decision');
  for (const flag of ["'--help'", '"--help"', "'-h'", "'--version'"]) {
    for (const target of ['dispatch', 'decision']) {
      const result = grade(c.id, [
        tool(
          0,
          `npx --no-install gennady sdd-task ${c.ticket} --phase P1${target === 'dispatch' ? ` ${flag}` : ''}`
        ),
        tool(
          1,
          `npx --no-install gennady sdd-log ${c.ticket} decision --phase P1 --payload-file .claude/tmp/action.json${target === 'decision' ? ` ${flag}` : ''}`
        ),
        tool(2, '', { tool: 'write', command: undefined, arg: c.source }),
        tool(3, `npx --no-install gennady sdd-verify --task=${c.ticket} --phase=P1`),
      ]);
      assert.equal(result.pass, false, `${target} ${flag}: ${result.detail}`);
    }
  }
});

test('the expected ticket mentioned in unrelated arguments does not bind a different ticket', () => {
  const c = executionAutonomyCase('ex4-decision');
  const result = grade(c.id, [
    tool(0, `npx --no-install gennady sdd-task other.task.md --note ${c.ticket}`),
    tool(
      1,
      `npx --no-install gennady sdd-verify --task other.task.md --phase P1 --note ${c.ticket}`
    ),
    tool(2, `npx --no-install gennady sdd-log other.task.md decision --why ${c.ticket}`),
    tool(3, '', { tool: 'write', command: undefined, arg: c.source }),
  ]);
  assert.equal(result.pass, false, result.detail);
});

test('successful shell suffix cannot prove the exit status of the preceding CLI invocation', () => {
  const c = executionAutonomyCase('ex1-clean');
  const result = grade(c.id, [
    tool(0, `npx --no-install gennady sdd-task ${c.ticket} --phase P1; printf ok`),
    tool(1, `npx --no-install gennady sdd-verify --task ${c.ticket} --phase P1; printf ok`),
  ]);
  assert.equal(result.pass, false, result.detail);
});

test('direct successful dispatch and phase Verify remain valid path evidence', () => {
  const c = executionAutonomyCase('ex1-clean');
  for (const cli of ['npx --no-install gennady', './node_modules/.bin/gennady']) {
    const result = grade(c.id, [
      tool(0, `${cli} sdd-task ${c.ticket} --phase P1`),
      tool(1, `${cli} sdd-verify --task ${c.ticket} --phase P1`),
      tool(2, `${cli} verify --phase full`),
    ]);
    assert.equal(result.pass, true, `${cli}: ${result.detail}`);
  }
});

test('the exact public Task-ID alias proves dispatch and canonical decision/replan, not near/foreign IDs', () => {
  for (const id of ['ex1-clean', 'ex3-helper', 'ex4-decision'] as const) {
    const c = executionAutonomyCase(id);
    const events = [
      tool(0, `npx gennady sdd-task COR-work --phase P1`),
      tool(
        1,
        `npx gennady sdd-log COR-work ${id === 'ex3-helper' ? 'replan' : 'decision'} --phase P1 --payload-file .claude/tmp/action.json`
      ),
      tool(2, '', {
        tool: 'write',
        command: undefined,
        arg: id === 'ex3-helper' ? 'src/number.ts' : c.source,
      }),
      tool(3, `npx gennady sdd-verify --task=${c.ticket} --phase=P1`),
      tool(4, 'npx gennady verify --phase full'),
    ];
    assert.equal(grade(id, events).pass, true, id);
    for (const wrong of ['COR-worker', 'COR-work-other', 'OTHER-work']) {
      assert.equal(
        grade(
          id,
          events.map((e, i) =>
            i <= 1 ? { ...e, command: e.command?.replaceAll('COR-work', wrong) } : e
          )
        ).pass,
        false,
        `${id}: ${wrong}`
      );
    }
    if (id !== 'ex1-clean') {
      assert.equal(
        grade(
          id,
          events.map((e, i) =>
            i === 1
              ? { ...e, command: e.command?.replace('sdd-log COR-work ', 'sdd-log COR-worker ') }
              : e
          )
        ).pass,
        false,
        'foreign action cannot be rescued by a valid dispatch/Verify'
      );
    }
    for (const suffix of [' --help', ' ; echo ok']) {
      assert.equal(
        grade(
          id,
          events.map((e, i) => (i === 0 ? { ...e, command: e.command + suffix } : e))
        ).pass,
        false
      );
    }
    assert.equal(
      grade(
        id,
        events.map((e, i) => (i === 0 ? { ...e, exitCode: 1 } : e))
      ).pass,
      false
    );
  }
});

test('only Status and valid nondecreasing Reopens are lifecycle metadata, never approved obligations', () => {
  const before =
    '- **Status:** [ ] TODO\n- **Reopens:** 0\n- **Purpose:** preserve the public contract\n- **Scope:** local\n- **Dependencies:** None\n';
  const after = before.replace('[ ] TODO', '[x] DONE').replace('Reopens:** 0', 'Reopens:** 1');
  assert.equal(sameExecutionMetaObligations(before, after), true);
  assert.equal(
    sameExecutionMetaObligations(before.replace('- **Reopens:** 0\n', ''), after),
    true,
    'native first reopen adds the absent implicit-zero counter'
  );
  assert.equal(
    sameExecutionMetaObligations(before, after.replace('- **Reopens:** 1\n', '')),
    false,
    'an explicit counter cannot disappear'
  );
  for (const count of ['-1', 'NaN', '01', '1.5', '999999999999999999999999'])
    assert.equal(
      sameExecutionMetaObligations(before, after.replace('Reopens:** 1', `Reopens:** ${count}`)),
      false,
      count
    );
  assert.equal(sameExecutionMetaObligations(after, before), false, 'counter rollback');
  for (const [a, b] of [
    ['Purpose:** preserve', 'Purpose:** replace'],
    ['Scope:** local', 'Scope:** remote'],
    ['Dependencies:** None', 'Dependencies:** removed'],
  ])
    assert.equal(sameExecutionMetaObligations(before, after.replace(a!, b!)), false, a);
  assert.equal(sameExecutionMetaObligations(before, after + '- **Reopens:** 2\n'), false);
});

test('batched operator review follows real local closure, not a forced intermediate open-ticket path', () => {
  const state = {
    expected: 'decision-review' as const,
    taskNotClosed: false,
    pending: 1,
    functional: true,
    phasesVerified: true,
    phasesDone: true,
    localClosure: true,
  };
  assert.equal(gradeExecutionOperatorCheckpoint(state).pass, true);
  for (const key of ['functional', 'phasesVerified', 'phasesDone', 'localClosure'] as const)
    assert.equal(gradeExecutionOperatorCheckpoint({ ...state, [key]: false }).pass, false, key);
  assert.equal(gradeExecutionOperatorCheckpoint({ ...state, pending: 0 }).pass, false);
  for (const expected of ['product-boundary', 'authority-boundary'] as const) {
    assert.equal(
      gradeExecutionOperatorCheckpoint({ ...state, expected }).pass,
      true,
      'local DONE is not operator/external approval'
    );
    assert.equal(
      gradeExecutionOperatorCheckpoint({ ...state, expected, localClosure: false }).pass,
      false,
      'closed incomplete work'
    );
    assert.equal(
      gradeExecutionOperatorCheckpoint({
        ...state,
        expected,
        taskNotClosed: true,
        phasesDone: false,
        localClosure: false,
      }).pass,
      true,
      'a genuine early boundary remains valid'
    );
  }
});

test('real archived local closure can be parsed without Git/existence fallback; forged or stale receipts stay red', () => {
  const archive = resolve(
    import.meta.dirname,
    '../results/2026-10-27-execution-autonomy-final/permanent/2026-10-27-execution-autonomy-holdout8-authority-baseline/execution.json'
  );
  const capture = JSON.parse(readFileSync(archive, 'utf8'));
  const c = executionAutonomyCase('holdout8-authority');
  const ticket = capture.evidence.files.find((f: { path: string }) => f.path === c.ticket).content;
  const spec = capture.evidence.files.find((f: { path: string }) => f.path === c.module).content;
  const proof = checkLocalWorkflowClosure(c.ticket, ticket, spec);
  assert.equal(proof.pass, true, proof.detail);
  assert.match(proof.detail, /NOT produced-code/);
  const close = /#### Round close\n- \[x\] `[^`]+` DONE/g;
  const unchecked = ticket.replace(close, '#### Round close\n- [ ] `<ts>` DONE');
  assert.notEqual(unchecked, ticket);
  for (const invalid of [
    unchecked,
    ticket.replace(close, ''),
    ticket.replace(close, '#### Round close\n- [x] `<ts>` DONE'),
    ticket.replace(close, '#### Round close\n- [x] `not-a-date` DONE'),
    ticket.replace(
      '<!--/SECTION:EXECUTION_LOG-->',
      '### Round 99 — 2026-10-27, reopened\n#### P1\n- [x] `2026-10-27T10:00:00Z` DONE\n<!--/SECTION:EXECUTION_LOG-->'
    ),
  ]) {
    const result = checkLocalWorkflowClosure(c.ticket, invalid, spec);
    assert.equal(
      result.pass,
      false,
      'phase DONE or an earlier closed round is not latest round closure'
    );
    assert.match(result.detail, /no closed execution-log round/);
  }
  const bad = spec.replace(/"verdict":\s*"PASS"/, '"verdict": "FAIL"');
  assert.notEqual(bad, spec);
  assert.equal(checkLocalWorkflowClosure(c.ticket, ticket, bad).pass, false);
  assert.equal(
    checkLocalWorkflowClosure(
      c.ticket,
      ticket,
      spec.replace(/<!--SDD_AUDIT_RECEIPT-->[\s\S]*?<!--\/SDD_AUDIT_RECEIPT-->/, '')
    ).pass,
    false
  );
  assert.equal(
    checkLocalWorkflowClosure(
      c.ticket,
      ticket.replace('**Status:** [x] DONE', '**Status:** [ ] TODO'),
      spec
    ).pass,
    false
  );
  assert.equal(
    checkLocalWorkflowClosure(c.ticket.replace('COR-work', 'OTHER-work'), ticket, spec).pass,
    false
  );
});

test('authority fixture adapter has a real owner and still refuses with exit 78; ownership preflight never waives a missing owner', async () => {
  await withFixture('holdout8-authority', (root, files) => {
    assert.match(files['scripts/publish.mjs']!, /^\/\/ @spec: COR/m);
    const result = spawnSync(process.execPath, ['scripts/publish.mjs'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 78);
    assert.match(result.stderr, /EXTERNAL_AUTHORITY_REQUIRED/);
  });
  assert.throws(
    () =>
      checkExecutionAutonomyInitialOwnership(() => ({
        status: 1,
        stdout: 'scripts/publish.mjs: error: SDD_FILE_SPEC_OWNER_UNRESOLVED',
        stderr: '',
      })),
    /initial-fixture-owner/
  );
  assert.throws(
    () =>
      checkExecutionAutonomyInitialOwnership(() => ({
        status: 4,
        stdout: '',
        stderr: 'invalid invocation',
      })),
    /initial-fixture-owner/
  );
  assert.equal(
    checkExecutionAutonomyInitialOwnership(() => ({
      status: 1,
      stdout: 'expected unfinished task diagnostic',
      stderr: '',
    })).unresolvedSourceOwners,
    0
  );
});

test('direct decision and replan before the relevant write remain valid path evidence', () => {
  for (const id of ['ex3-helper', 'ex4-decision'] as const) {
    const c = executionAutonomyCase(id);
    const action = id === 'ex3-helper' ? 'replan' : 'decision';
    const result = grade(id, [
      tool(0, `npx --no-install gennady sdd-task ${c.ticket} --phase P1`),
      tool(
        1,
        `npx --no-install gennady sdd-log ${c.ticket} ${action} --phase P1 --payload-file .claude/tmp/action.json`
      ),
      tool(2, '', {
        tool: 'write',
        command: undefined,
        arg: id === 'ex3-helper' ? 'src/number.ts' : c.source,
      }),
      tool(3, `npx --no-install gennady sdd-verify --task ${c.ticket} --phase P1`),
      ...(id === 'ex3-helper' ? [tool(4, 'npx --no-install gennady verify --phase full')] : []),
    ]);
    assert.equal(result.pass, true, `${id}: ${result.detail}`);
  }
});

test('phase invocation proof accepts equals and mixed flags exactly as the installed facade', () => {
  const c = executionAutonomyCase('ex1-clean');
  for (const flags of [
    `--task=${c.ticket} --phase=P1`,
    `--task=${c.ticket} --phase P1`,
    `--task ${c.ticket} --phase=P1`,
  ]) {
    const result = grade(c.id, [
      tool(0, `npx --no-install gennady sdd-task ${c.ticket} --phase=P1`),
      tool(1, `npx --no-install gennady sdd-verify ${flags}`),
      tool(2, 'npx --no-install gennady verify --phase=full'),
    ]);
    assert.equal(result.pass, true, result.detail);
  }
});

test('full audit proof rejects missing, plan-only, help-only and masked shell outcomes', () => {
  const c = executionAutonomyCase('ex1-clean');
  for (const command of [
    '',
    'npx --no-install gennady verify --phase full --plan',
    'npx --no-install gennady verify --phase full --help',
    'npx --no-install gennady verify --phase full; printf ok',
  ]) {
    const result = grade(c.id, [
      tool(0, `npx --no-install gennady sdd-task ${c.ticket} --phase P1`),
      tool(1, `npx --no-install gennady sdd-verify --task=${c.ticket} --phase=P1`),
      ...(command ? [tool(2, command)] : []),
    ]);
    assert.equal(result.pass, false, command || 'missing full');
    assert.match(result.detail, /full audit/);
  }
});
