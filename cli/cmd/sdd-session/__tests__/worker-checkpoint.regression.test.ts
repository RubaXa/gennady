// @file: CLI-level typed execute-worker checkpoint regressions extracted from draft.60.
// @consumers: sdd-session checkpoint
// @tasks: N/A

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildRepoFixture } from '../../../__tests__/tool-behavior/fixture.ts';
import { runCli } from '../../../__tests__/tool-behavior/run-cli.ts';

const TICKET = 'specs/infra/infra.task.IB-boot.md';
const PAYLOAD = '.claude/tmp/sdd-worker-checkpoint-event.json';

type Outcome =
  | 'CONTINUE'
  | 'CONTEXT_ROTATION'
  | 'RECOVERABLE_TECHNICAL'
  | 'SPEC_GOAL_CONFLICT'
  | 'EXTERNAL_AUTHORITY_REQUIRED'
  | 'TECHNICAL_REPLAN_EXHAUSTED';

function fixture() {
  return buildRepoFixture({
    files: {
      [TICKET]: [
        '# Task: IB-boot',
        '<!--SECTION:DECISION_LOG-->',
        '## Decision Log',
        '- IB-DL-1 — Node 22 is selected.',
        '- IB-DL-2 — TypeScript 5.9 is selected.',
        '- IB-DEV-1 — package install is split from config.',
        '- IB-DEV-2 — missing tool facts were added to the technical DAG.',
        '<!--/SECTION:DECISION_LOG-->',
        '<!--SECTION:PHASE_P1-->',
        '### P1 — config',
        '- **Objective:** install dependencies',
        '<!--/SECTION:PHASE_P1-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '## Execution Log',
        '- P1 in progress',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
      'specs/infra/infra.task.IB-app.md': [
        '# Task: IB-app',
        'IB-DL-1 IB-DL-2 IB-DEV-1',
        '<!--SECTION:PHASE_P2-->',
        '### P2 — app',
        '<!--/SECTION:PHASE_P2-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '## Execution Log',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
    },
  });
}

function payload(options: {
  seq?: number;
  outcome?: Outcome | 'BLOCKED';
  reason?: string;
  attempt?: number;
  budget?: number;
  worker?: string;
  evidence?: string[];
  deviations?: string[];
  task?: string;
  phase?: string;
}) {
  const outcome = options.outcome ?? 'CONTINUE';
  const recoverable = outcome === 'RECOVERABLE_TECHNICAL';
  const task = options.task ?? 'IB-boot';
  const phase = options.phase ?? 'P1';
  const ticket = task === 'IB-boot' ? TICKET : `specs/infra/infra.task.${task}.md`;
  return {
    schema: 'sdd-worker-checkpoint/v1',
    seq: options.seq ?? 1,
    task,
    phase,
    worker: {
      session: options.worker ?? 'execute-config-3m',
      kind: 'config',
      observedContextChars: 3_100_000,
    },
    reason: options.reason ?? 'context-budget',
    outcome,
    attempt: { current: options.attempt ?? (recoverable ? 1 : 0), budget: options.budget ?? 2 },
    evidence: options.evidence ?? [`${ticket}#EXECUTION_LOG`],
    technicalPlan: recoverable
      ? {
          summary: 'repair the technical phase boundary inside approved goals',
          taskEdits: [`${ticket}#PHASE_${phase}`],
          dagEdits: [ticket],
          artifactEdits: ['package.json'],
        }
      : null,
    durableRefs: {
      phase: `${ticket}#PHASE_${phase}`,
      task: ticket,
      decisions: [`${ticket}#IB-DL-1`, `${ticket}#IB-DL-2`],
      deviations: options.deviations ?? [`${ticket}#IB-DEV-1`],
      handoff: `${ticket}#EXECUTION_LOG`,
    },
  };
}

function open(root: string): void {
  const opened = runCli(['sdd-session', 'open', '--intent', 'execute'], root);
  assert.strictEqual(opened.exitCode, 0, opened.stdout + opened.stderr);
}

function apply(root: string, value: unknown) {
  const payloadPath = join(root, PAYLOAD);
  writeFileSync(payloadPath, JSON.stringify(value), 'utf8');
  const result = runCli(['sdd-session', 'checkpoint', '--content-file', PAYLOAD], root);
  return { result, payloadPath, output: `${result.stdout}${result.stderr}` };
}

describe('execute-worker durable checkpoint', () => {
  it('rotates a 3.1M-character worker from durable phase/task/decision/deviation refs', () => {
    const { root } = fixture();
    try {
      open(root);
      const checkpoint = apply(root, payload({ outcome: 'CONTEXT_ROTATION' }));
      const session = readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf8');
      assert.strictEqual(checkpoint.result.exitCode, 0, checkpoint.output);
      assert.match(checkpoint.output, /sdd-worker-checkpoint\/v1/);
      assert.match(checkpoint.output, /NEXT=ROTATE_EXECUTE_WORKER/);
      for (const ref of [
        `${TICKET}#PHASE_P1`,
        `${TICKET}#IB-DL-1`,
        `${TICKET}#IB-DL-2`,
        `${TICKET}#IB-DEV-1`,
      ]) {
        assert.match(session, new RegExp(ref.replaceAll('.', '\\.')));
        assert.match(checkpoint.output, new RegExp(ref.replaceAll('.', '\\.')));
      }
      assert.strictEqual(existsSync(checkpoint.payloadPath), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const reason of [
    'missing @types/node or compiler config',
    'missing eslint-config-prettier package materialization',
    'repair-command contract mismatch',
    'missing CREATE target or task decomposition edge',
  ]) {
    it(`routes ${reason} to bounded autonomous replan`, () => {
      const { root } = fixture();
      try {
        open(root);
        const checkpoint = apply(
          root,
          payload({ outcome: 'RECOVERABLE_TECHNICAL', reason, attempt: 1, budget: 2 })
        );
        assert.strictEqual(checkpoint.result.exitCode, 0, checkpoint.output);
        assert.match(checkpoint.output, /NEXT=AUTO_REPLAN_AND_CONTINUE/);
        assert.doesNotMatch(checkpoint.output, /ASK_OPERATOR/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  for (const [outcome, next] of [
    ['SPEC_GOAL_CONFLICT', 'ASK_OPERATOR_SPEC_GOAL_CONFLICT'],
    ['EXTERNAL_AUTHORITY_REQUIRED', 'ASK_OPERATOR_EXTERNAL_AUTHORITY_REQUIRED'],
    ['TECHNICAL_REPLAN_EXHAUSTED', 'ASK_OPERATOR_TECHNICAL_REPLAN_EXHAUSTED'],
  ] as const) {
    it(`${outcome} is an explicit operator boundary`, () => {
      const { root } = fixture();
      try {
        open(root);
        if (outcome === 'TECHNICAL_REPLAN_EXHAUSTED') {
          const prior = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
          assert.strictEqual(prior.result.exitCode, 0, prior.output);
        }
        const checkpoint = apply(
          root,
          payload({
            seq: outcome === 'TECHNICAL_REPLAN_EXHAUSTED' ? 2 : 1,
            outcome,
            reason: `typed ${outcome.toLowerCase()} evidence`,
            attempt: outcome === 'TECHNICAL_REPLAN_EXHAUSTED' ? 2 : 0,
            budget: 2,
          })
        );
        assert.strictEqual(checkpoint.result.exitCode, 0, checkpoint.output);
        assert.match(checkpoint.output, new RegExp(`NEXT=${next}`));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('rejects generic BLOCKED and preserves session/payload bytes', () => {
    const { root } = fixture();
    try {
      open(root);
      const sessionPath = join(root, 'specs', '.sdd-session.md');
      const before = readFileSync(sessionPath, 'utf8');
      const checkpoint = apply(root, payload({ outcome: 'BLOCKED' }));
      assert.notStrictEqual(checkpoint.result.exitCode, 0);
      assert.strictEqual(readFileSync(sessionPath, 'utf8'), before);
      assert.strictEqual(existsSync(checkpoint.payloadPath), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed JSON without mutating session or consuming payload', () => {
    const { root } = fixture();
    try {
      open(root);
      const sessionPath = join(root, 'specs', '.sdd-session.md');
      const before = readFileSync(sessionPath, 'utf8');
      const payloadPath = join(root, PAYLOAD);
      writeFileSync(payloadPath, '{"schema":"sdd-worker-checkpoint/v1"', 'utf8');
      const result = runCli(['sdd-session', 'checkpoint', '--content-file', PAYLOAD], root);
      const output = `${result.stdout}${result.stderr}`;
      assert.notStrictEqual(result.exitCode, 0);
      assert.match(output, /not valid JSON/);
      assert.strictEqual(readFileSync(sessionPath, 'utf8'), before);
      assert.strictEqual(existsSync(payloadPath), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('advances to a new task/phase only after a CONTINUE checkpoint', () => {
    const { root } = fixture();
    try {
      open(root);
      const first = apply(root, payload({ outcome: 'CONTINUE' }));
      assert.strictEqual(first.result.exitCode, 0, first.output);
      const next = apply(
        root,
        payload({ seq: 2, outcome: 'CONTINUE', task: 'IB-app', phase: 'P2' })
      );
      assert.strictEqual(next.result.exitCode, 0, next.output);
      assert.match(next.output, /task=IB-app phase=P2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a stale seq without mutating the accepted checkpoint', () => {
    const { root } = fixture();
    try {
      open(root);
      const first = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
      assert.strictEqual(first.result.exitCode, 0, first.output);
      const sessionPath = join(root, 'specs', '.sdd-session.md');
      const before = readFileSync(sessionPath, 'utf8');
      const stale = apply(root, payload({ seq: 1, outcome: 'RECOVERABLE_TECHNICAL' }));
      assert.notStrictEqual(stale.result.exitCode, 0);
      assert.match(stale.output, /seq must be 2/);
      assert.strictEqual(readFileSync(sessionPath, 'utf8'), before);
      assert.strictEqual(existsSync(stale.payloadPath), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exhaustion preserves prior attempts and deviation refs', () => {
    const { root } = fixture();
    try {
      open(root);
      const first = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
      assert.strictEqual(first.result.exitCode, 0, first.output);
      const second = apply(
        root,
        payload({
          seq: 2,
          outcome: 'TECHNICAL_REPLAN_EXHAUSTED',
          attempt: 2,
          worker: 'execute-config-resumed',
          deviations: [`${TICKET}#IB-DEV-1`, `${TICKET}#IB-DEV-2`],
        })
      );
      assert.strictEqual(second.result.exitCode, 0, second.output);
      assert.match(second.output, /attempt=2\/2/);
      assert.match(second.output, /IB-DEV-1/);
      assert.match(second.output, /IB-DEV-2/);
      const session = readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf8');
      assert.strictEqual((session.match(/sdd-worker-checkpoint\/v1/g) ?? []).length, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [name, first, second, expected] of [
    ['worker budget override', payload({ budget: 3 }), null, /budget must be CLI-owned value 2/],
    [
      'first recoverable jump',
      payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 2 }),
      null,
      /first RECOVERABLE_TECHNICAL attempt must be 1/,
    ],
    [
      'immediate exhaustion',
      payload({ outcome: 'TECHNICAL_REPLAN_EXHAUSTED', attempt: 2 }),
      null,
      /requires prior RECOVERABLE_TECHNICAL/,
    ],
    [
      'repeated attempt',
      payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }),
      payload({ seq: 2, outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }),
      /attempt must advance exactly/,
    ],
  ] as const) {
    it(`rejects ${name} without mutating the rejected transition`, () => {
      const { root } = fixture();
      try {
        open(root);
        if (second) {
          const accepted = apply(root, first);
          assert.strictEqual(accepted.result.exitCode, 0, accepted.output);
        }
        const sessionPath = join(root, 'specs', '.sdd-session.md');
        const before = readFileSync(sessionPath, 'utf8');
        const rejected = apply(root, second ?? first);
        assert.notStrictEqual(rejected.result.exitCode, 0);
        assert.match(rejected.output, expected);
        assert.strictEqual(readFileSync(sessionPath, 'utf8'), before);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('context rotation retains attempt and durable refs without consuming retry budget', () => {
    const { root } = fixture();
    try {
      open(root);
      const first = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
      assert.strictEqual(first.result.exitCode, 0, first.output);
      const rotation = apply(
        root,
        payload({ seq: 2, outcome: 'CONTEXT_ROTATION', attempt: 1, worker: 'rotated-worker' })
      );
      assert.strictEqual(rotation.result.exitCode, 0, rotation.output);
      assert.match(rotation.output, /NEXT=ROTATE_EXECUTE_WORKER/);
      assert.match(rotation.output, /attempt=1\/2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps exhaustion reachable after a context rotation', () => {
    const { root } = fixture();
    try {
      open(root);
      const recoverable = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
      assert.strictEqual(recoverable.result.exitCode, 0, recoverable.output);
      const rotation = apply(
        root,
        payload({ seq: 2, outcome: 'CONTEXT_ROTATION', attempt: 1, worker: 'rotated-worker' })
      );
      assert.strictEqual(rotation.result.exitCode, 0, rotation.output);
      const exhausted = apply(
        root,
        payload({
          seq: 3,
          outcome: 'TECHNICAL_REPLAN_EXHAUSTED',
          attempt: 2,
          worker: 'rotated-worker',
        })
      );
      assert.strictEqual(exhausted.result.exitCode, 0, exhausted.output);
      assert.match(exhausted.output, /NEXT=ASK_OPERATOR_TECHNICAL_REPLAN_EXHAUSTED/);
      assert.match(exhausted.output, /attempt=2\/2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows a first recoverable attempt after an initial context rotation', () => {
    const { root } = fixture();
    try {
      open(root);
      const rotation = apply(root, payload({ outcome: 'CONTEXT_ROTATION', attempt: 0 }));
      assert.strictEqual(rotation.result.exitCode, 0, rotation.output);
      const recoverable = apply(
        root,
        payload({ seq: 2, outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 })
      );
      assert.strictEqual(recoverable.result.exitCode, 0, recoverable.output);
      assert.match(recoverable.output, /NEXT=AUTO_REPLAN_AND_CONTINUE/);
      assert.match(recoverable.output, /attempt=1\/2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not reset the retry attempt across multiple context rotations', () => {
    const { root } = fixture();
    try {
      open(root);
      const recoverable = apply(root, payload({ outcome: 'RECOVERABLE_TECHNICAL', attempt: 1 }));
      assert.strictEqual(recoverable.result.exitCode, 0, recoverable.output);
      for (const [seq, worker] of [
        [2, 'rotated-worker-1'],
        [3, 'rotated-worker-2'],
      ] as const) {
        const rotation = apply(
          root,
          payload({ seq, outcome: 'CONTEXT_ROTATION', attempt: 1, worker })
        );
        assert.strictEqual(rotation.result.exitCode, 0, rotation.output);
        assert.match(rotation.output, /attempt=1\/2/);
      }
      const exhausted = apply(
        root,
        payload({
          seq: 4,
          outcome: 'TECHNICAL_REPLAN_EXHAUSTED',
          attempt: 2,
          worker: 'rotated-worker-2',
        })
      );
      assert.strictEqual(exhausted.result.exitCode, 0, exhausted.output);
      assert.match(exhausted.output, /attempt=2\/2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [name, mutate, expected] of [
    [
      'missing durable file',
      (value: any) => {
        value.durableRefs.task = 'specs/missing.task.md';
        value.durableRefs.phase = 'specs/missing.task.md#PHASE_P1';
      },
      /durable ref file does not exist/,
    ],
    [
      'missing durable anchor',
      (value: any) => {
        value.durableRefs.handoff = `${TICKET}#MISSING_ANCHOR`;
      },
      /durable ref anchor does not exist/,
    ],
  ] as const) {
    it(`rejects ${name} without mutation or payload consumption`, () => {
      const { root } = fixture();
      try {
        open(root);
        const value = payload({ outcome: 'CONTEXT_ROTATION' });
        mutate(value);
        const before = readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf8');
        const rejected = apply(root, value);
        assert.notStrictEqual(rejected.result.exitCode, 0);
        assert.match(rejected.output, expected);
        assert.strictEqual(readFileSync(join(root, 'specs', '.sdd-session.md'), 'utf8'), before);
        assert.strictEqual(existsSync(rejected.payloadPath), true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
