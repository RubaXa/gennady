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
  checkReadOnly: false,
  gennadyAvailable: false,
  ready: false,
  missing: ['package.json'],
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
      ),
      ['infra-1']
    );
  });

  it('returns none once readiness is already green', () => {
    assert.deepEqual(
      queuedInfraGateTicketIds([ref('infra-1', '[ ] TODO', 'infra-core')], [infraScope], {
        ...notReady,
        ready: true,
      }),
      []
    );
  });
});
