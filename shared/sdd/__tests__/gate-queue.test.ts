// @file: Unit tests for queue-aware readiness classification.
// @consumers: node:test runner
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queuedInfraGateTicketIds } from '../gate-queue.ts';
import type { TicketRef } from '../check.ts';
import type { Scope } from '../portal.ts';
import type { ReadinessResult } from '../readiness.ts';

const notReady: ReadinessResult = {
  packageJsonPresent: false,
  required: [],
  lintHasGennady: false,
  formatReadOnly: false,
  lintReadOnly: false,
  checkReadOnly: false,
  formatFixMutates: false,
  lintFixMutates: false,
  gennadyAvailable: false,
  ready: false,
  missing: ['package.json'],
  stubbed: [],
  level: 'not-ready',
  executionReady: false,
};

const infraScope: Scope = {
  name: 'infra-core',
  type: 'infrastructure',
  status: 'wip',
  description: 'tooling',
  specPath: './infra-core.spec.md',
};

function ref(taskId: string, status: string, scope: string): TicketRef {
  return { taskId, status, scope, dependencies: [], file: `/repo/${taskId}.md` };
}

describe('queuedInfraGateTicketIds', () => {
  it('returns only TODO tickets owned by an infrastructure scope', () => {
    assert.deepEqual(
      queuedInfraGateTicketIds(
        [ref('infra-1', '[ ] TODO', 'infra-core'), ref('app-1', '[ ] TODO', 'app')],
        [infraScope],
        notReady
      ).ticketIds,
      ['infra-1']
    );
  });

  it('returns none once readiness is execution-ready, with no diagnostics either', () => {
    const result = queuedInfraGateTicketIds(
      [ref('infra-1', '[ ] TODO', 'infra-core')],
      [infraScope],
      {
        ...notReady,
        ready: true,
        level: 'ready',
        executionReady: true,
      }
    );
    assert.deepEqual(result.ticketIds, []);
    assert.deepEqual(result.diagnostics, []);
  });

  // The orchestrator flips Meta Status to `[~] IN_PROGRESS` when it opens the Round — BEFORE the
  // first phase runs. A TODO-only queue emptied itself exactly when work started, withdrawing the
  // infra-queue exemption from the ticket that was already executing and deadlocking it.
  it('an IN_PROGRESS infra ticket stays in the queue — the gates are not built until it is DONE', () => {
    assert.deepEqual(
      queuedInfraGateTicketIds(
        [ref('infra-1', '[~] IN_PROGRESS', 'infra-core')],
        [infraScope],
        notReady
      ).ticketIds,
      ['infra-1']
    );
  });

  it('a DONE infra ticket leaves the queue — it already built what it owed', () => {
    assert.deepEqual(
      queuedInfraGateTicketIds([ref('infra-1', '[x] DONE', 'infra-core')], [infraScope], notReady)
        .ticketIds,
      []
    );
  });

  it('provisional readiness (stubs) still surfaces the queue — those tickets are what replace the stubs', () => {
    const result = queuedInfraGateTicketIds(
      [ref('infra-1', '[ ] TODO', 'infra-core')],
      [infraScope],
      {
        ...notReady,
        ready: true,
        stubbed: ['test', 'format'],
        level: 'provisional',
        executionReady: false,
      }
    );
    assert.deepEqual(result.ticketIds, ['infra-1']);
  });

  it('flags an approved infra scope with no ticket referencing it yet', () => {
    const approvedInfra: Scope = { ...infraScope, status: 'done' };
    const result = queuedInfraGateTicketIds(
      [ref('app-1', '[ ] TODO', 'app')],
      [approvedInfra],
      notReady
    );
    assert.deepEqual(result.ticketIds, []);
    assert.strictEqual(result.diagnostics.length, 1);
    assert.strictEqual(result.diagnostics[0]?.kind, 'infra-spec-no-tickets');
    assert.ok(result.diagnostics[0]?.message.includes('infra-core'));
  });

  it('does not flag an approved infra scope once any ticket references it, even non-TODO', () => {
    const approvedInfra: Scope = { ...infraScope, status: 'done' };
    const result = queuedInfraGateTicketIds(
      [ref('infra-1', '[x] DONE', 'infra-core')],
      [approvedInfra],
      notReady
    );
    assert.deepEqual(
      result.diagnostics.filter((d) => d.kind === 'infra-spec-no-tickets'),
      []
    );
  });

  it('does not flag a wip (unapproved) infra scope with no tickets', () => {
    const result = queuedInfraGateTicketIds([], [infraScope], notReady);
    assert.deepEqual(result.diagnostics, []);
  });

  it('flags a TODO ticket whose scope near-misses a portal infra name (case/dash-insensitive)', () => {
    const result = queuedInfraGateTicketIds(
      [ref('infra-1', '[ ] TODO', 'Infra_Core')],
      [infraScope],
      notReady
    );
    assert.deepEqual(result.ticketIds, []);
    assert.strictEqual(result.diagnostics.length, 1);
    assert.strictEqual(result.diagnostics[0]?.kind, 'scope-name-mismatch');
    assert.ok(result.diagnostics[0]?.message.includes('Infra_Core'));
    assert.ok(result.diagnostics[0]?.message.includes('infra-core'));
  });

  it('a near-miss-named ticket counts as scaffolded — no redundant "no tickets" diagnostic', () => {
    const approvedInfra: Scope = { ...infraScope, status: 'done' };
    const result = queuedInfraGateTicketIds(
      [ref('infra-1', '[ ] TODO', 'Infra_Core')],
      [approvedInfra],
      notReady
    );
    assert.deepEqual(
      result.diagnostics.filter((d) => d.kind === 'infra-spec-no-tickets'),
      []
    );
    assert.strictEqual(
      result.diagnostics.filter((d) => d.kind === 'scope-name-mismatch').length,
      1
    );
  });

  it('does not flag a scope name that is unrelated, not just near-miss', () => {
    const result = queuedInfraGateTicketIds(
      [ref('app-1', '[ ] TODO', 'totally-different')],
      [infraScope],
      notReady
    );
    assert.deepEqual(
      result.diagnostics.filter((d) => d.kind === 'scope-name-mismatch'),
      []
    );
  });
});
