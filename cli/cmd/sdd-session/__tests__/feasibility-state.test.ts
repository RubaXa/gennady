// @file: Pure transition regressions for the typed scaffold feasibility session lifecycle.
// @consumers: sdd-session feasibility
// @tasks: N/A

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyFeasibilityEvent } from '../feasibility-state.ts';
import { buildSkeleton } from '../sdd-session.types.ts';

const PATH = 'specs/app/app.task.TA-a.md';
const hash = (digit: string): Record<string, string> => ({ [PATH]: digit.repeat(64) });
const event = (seq: number, name: string, payload: Record<string, unknown>): string =>
  JSON.stringify({
    schema: 'sdd-scaffold-feasibility/v1',
    cycle: 'cap-cycle',
    seq,
    event: name,
    payload,
  });

function accepted(content: string, payload: string): { content: string; next: string } {
  const result = applyFeasibilityEvent(content, payload);
  assert.strictEqual(result.ok, true, result.ok ? '' : result.detail);
  return result;
}

describe('applyFeasibilityEvent cap and disposition transitions', () => {
  it('stops at result five and requires an explicit operator disposition before refresh', () => {
    let content = buildSkeleton('2026-09-01', 'scaffold');
    let step = accepted(
      content,
      event(1, 'opened', {
        targets: hash('1'),
        fallbackUsed: false,
        resultCount: 0,
        activeCap: 5,
      })
    );
    content = step.content;
    step = accepted(
      content,
      event(2, 'worker-state', {
        availability: 'alive',
        workerSession: 'critic-cap-worker',
        fallbackUsed: false,
      })
    );
    content = step.content;
    let seq = 3;
    for (let resultCount = 1; resultCount <= 5; resultCount++) {
      step = accepted(
        content,
        event(seq++, 'sensor-result', {
          resultCount,
          verdict: 'CHANGES',
          changes: [`round ${resultCount}`],
          targets: hash(String(resultCount)),
        })
      );
      content = step.content;
      if (resultCount < 5) {
        step = accepted(
          content,
          event(seq++, 'target-refreshed', {
            targets: hash(String(resultCount + 1)),
            changedTickets: [PATH],
          })
        );
        content = step.content;
      }
    }
    assert.match(step.next, /^NEXT=ASK_OPERATOR_CAP/);

    const beforeRejected = content;
    const prematureRefresh = applyFeasibilityEvent(
      content,
      event(seq, 'target-refreshed', { targets: hash('6'), changedTickets: [PATH] })
    );
    assert.strictEqual(prematureRefresh.ok, false);
    assert.strictEqual(content, beforeRejected);

    const disposition = accepted(
      content,
      event(seq++, 'operator-disposition', {
        resultCount: 5,
        disposition: 'CONTINUE THROUGH ROUND 6',
      })
    );
    assert.match(disposition.next, /^NEXT=APPLY_CHANGES_THEN_REFRESH_TARGETS/);
    assert.match(disposition.next, /activeCap=6/);
    const refreshed = accepted(
      disposition.content,
      event(seq, 'target-refreshed', { targets: hash('6'), changedTickets: [PATH] })
    );
    assert.match(refreshed.next, /^NEXT=REDISPATCH_CRITIC/);
  });

  it('routes a typed new fork to Gate 2 and requires its approved delta to be re-reviewed', () => {
    let content = buildSkeleton('2026-09-01', 'scaffold');
    content = accepted(
      content,
      event(1, 'opened', {
        targets: hash('a'),
        fallbackUsed: false,
        resultCount: 0,
        activeCap: 5,
      })
    ).content;
    content = accepted(
      content,
      event(2, 'worker-state', {
        availability: 'alive',
        workerSession: 'critic-fork-worker',
        fallbackUsed: false,
      })
    ).content;
    const fork = accepted(
      content,
      event(3, 'sensor-result', {
        resultCount: 1,
        verdict: 'NEW_FORK',
        changes: [],
        targets: hash('a'),
        fork: 'Choose the coverage owner for generated adapters',
      })
    );
    assert.match(fork.next, /^NEXT=PRESENT_GATE2/);
    const choice = accepted(
      fork.content,
      event(4, 'gate2-choice', {
        choices: ['Own generated-adapter coverage in TSK-adapter'],
        changedTickets: [PATH],
      })
    );
    assert.match(choice.next, /^NEXT=REFRESH_TARGETS/);
    const refreshed = accepted(
      choice.content,
      event(5, 'target-refreshed', { targets: hash('b'), changedTickets: [PATH] })
    );
    assert.match(refreshed.next, /^NEXT=REDISPATCH_CRITIC/);
    const clean = accepted(
      refreshed.content,
      event(6, 'sensor-result', {
        resultCount: 2,
        verdict: 'CLEAN',
        changes: [],
        targets: hash('b'),
      })
    );
    assert.match(clean.next, /^NEXT=FINALIZE/);
  });

  it('restarts into a new cycle with count and cap reset', () => {
    let content = buildSkeleton('2026-09-01', 'scaffold');
    content = accepted(
      content,
      event(1, 'opened', {
        targets: hash('1'),
        fallbackUsed: false,
        resultCount: 0,
        activeCap: 5,
      })
    ).content;
    content = accepted(
      content,
      event(2, 'worker-state', {
        availability: 'alive',
        workerSession: 'critic-restart-worker',
        fallbackUsed: false,
      })
    ).content;
    let seq = 3;
    for (let count = 1; count <= 5; count++) {
      content = accepted(
        content,
        event(seq++, 'sensor-result', {
          resultCount: count,
          verdict: 'CHANGES',
          changes: [`round ${count}`],
          targets: hash(String(count)),
        })
      ).content;
      if (count < 5) {
        content = accepted(
          content,
          event(seq++, 'target-refreshed', {
            targets: hash(String(count + 1)),
            changedTickets: [PATH],
          })
        ).content;
      }
    }
    const restart = accepted(
      content,
      event(seq, 'operator-disposition', {
        resultCount: 5,
        disposition: 'RESTART: replace the invalid ticket split',
      })
    );
    assert.match(restart.next, /^NEXT=OPEN_RESTART_CYCLE/);
    const opened = accepted(
      restart.content,
      JSON.stringify({
        payload: {
          activeCap: 5,
          resultCount: 0,
          fallbackUsed: false,
          targets: hash('a'),
        },
        event: 'opened',
        seq: 1,
        cycle: 'replacement-cycle',
        schema: 'sdd-scaffold-feasibility/v1',
      })
    );
    assert.match(opened.next, /^NEXT=RECORD_WORKER_STATE/);
    assert.match(opened.next, /resultCount=0 activeCap=5 workerSession=none/);
  });

  it('accepts equivalent JSON key and target-map insertion orders', () => {
    const first = 'specs/app/app.task.TA-a.md';
    const second = 'specs/app/app.task.TA-b.md';
    let content = buildSkeleton('2026-09-01', 'scaffold');
    content = accepted(
      content,
      JSON.stringify({
        event: 'opened',
        schema: 'sdd-scaffold-feasibility/v1',
        payload: {
          resultCount: 0,
          targets: { [first]: 'a'.repeat(64), [second]: 'b'.repeat(64) },
          activeCap: 5,
          fallbackUsed: false,
        },
        seq: 1,
        cycle: 'cap-cycle',
      })
    ).content;
    content = accepted(
      content,
      event(2, 'worker-state', {
        fallbackUsed: false,
        workerSession: 'critic-order-worker',
        availability: 'alive',
      })
    ).content;
    const result = accepted(
      content,
      event(3, 'sensor-result', {
        targets: { [second]: 'b'.repeat(64), [first]: 'a'.repeat(64) },
        changes: [],
        verdict: 'CLEAN',
        resultCount: 1,
      })
    );
    assert.match(result.next, /^NEXT=PRESENT_GATE2/);
  });

  it('retains worker identity through loss and permits only one fallback id', () => {
    let content = buildSkeleton('2026-09-01', 'scaffold');
    content = accepted(
      content,
      event(1, 'opened', {
        targets: hash('a'),
        fallbackUsed: false,
        resultCount: 0,
        activeCap: 5,
      })
    ).content;
    let state = accepted(
      content,
      event(2, 'worker-state', {
        availability: 'alive',
        workerSession: 'primary-worker',
        fallbackUsed: false,
      })
    );
    state = accepted(
      state.content,
      event(3, 'worker-state', {
        availability: 'lost',
        workerSession: 'primary-worker',
        fallbackUsed: false,
      })
    );
    assert.match(state.next, /workerSession=primary-worker/);
    state = accepted(
      state.content,
      event(4, 'worker-state', {
        availability: 'alive',
        workerSession: 'fallback-worker',
        fallbackUsed: true,
      })
    );
    state = accepted(
      state.content,
      event(5, 'worker-state', {
        availability: 'lost',
        workerSession: 'fallback-worker',
        fallbackUsed: true,
      })
    );
    assert.match(state.next, /workerSession=fallback-worker/);
    const beforeRejected = state.content;
    const secondFallback = applyFeasibilityEvent(
      beforeRejected,
      event(6, 'worker-state', {
        availability: 'alive',
        workerSession: 'second-fallback-worker',
        fallbackUsed: true,
      })
    );
    assert.strictEqual(secondFallback.ok, false);
    assert.strictEqual(state.content, beforeRejected);
  });
});
