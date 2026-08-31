// @file: Regression guard for scaffold's feasibility-critic state machine across Gate 2.
// @consumers: build-directives, sdd-scaffold

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');

function step(source: string, id: string): string {
  const match = source.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)</Step>`));
  assert.ok(match, `missing ${id}`);
  return match[0];
}

describe('scaffold feasibility-critic state machine', () => {
  const source = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');
  const builtSkeleton = read('ai', 'directives', 'sdd-v2', 'scaffold.directive.xml');
  const sourceCritic = step(source, 'STEP_3B_FEASIBILITY_CRITIC');
  const sourceGeneration = step(source, 'STEP_3_TASK_GENERATION');
  const sourceTicketLoop = step(source, 'STEP_3_TICKET_LOOP');
  const sourceGate2 = step(source, 'STEP_4_TEST_PLAN_REVIEW');
  const builtGeneration = read(
    'ai',
    'directives',
    'sdd-v2',
    'scaffold',
    'steps',
    'STEP_3_TASK_GENERATION.xml'
  );
  const builtTicketLoop = read(
    'ai',
    'directives',
    'sdd-v2',
    'scaffold',
    'steps',
    'STEP_3_TICKET_LOOP.xml'
  );
  const builtCritic = read(
    'ai',
    'directives',
    'sdd-v2',
    'scaffold',
    'steps',
    'STEP_3B_FEASIBILITY_CRITIC.xml'
  );
  const builtGate2 = read(
    'ai',
    'directives',
    'sdd-v2',
    'scaffold',
    'steps',
    'STEP_4_TEST_PLAN_REVIEW.xml'
  );
  const persistedState = read(
    'ai',
    'kit',
    'contract',
    'scaffold',
    'feasibility-state-format.xml'
  );

  it('carries every state field and one cumulative result count through Gate 2 and fallback', () => {
    for (const text of [sourceCritic, builtCritic]) {
      for (const field of [
        'LatestTargetSet',
        'ChangedTickets',
        'WorkerSession',
        'FallbackUsed',
        'ResultCount',
        'ActiveCap',
        'ApprovedGate2Choices',
        'PendingGate2Delta',
        'LastResult',
      ]) {
        assert.match(text, new RegExp(`\\b${field}\\b`));
      }
      assert.match(text, /exact latest bytes and content hash/);
      assert.match(text, /Never reset this record on Gate 2 or fallback/);
      assert.match(text, /keep `ResultCount`/);
    }
    assert.match(source, /contract\/scaffold\/feasibility-state-format/);
    assert.match(persistedState, /append-only/);
    assert.match(persistedState, /activeCap=5/);
    assert.match(persistedState, /session's `journal:` section/);
    assert.match(persistedState, /`closed` is the explicit\s+cleanup marker/s);
  });

  it('checks the active cap before CLEAN, fork, proceed, or another dispatch', () => {
    for (const text of [sourceCritic, builtCritic]) {
      const increment = text.indexOf('Increment `ResultCount`');
      const cap = text.indexOf('then evaluate `ResultCount >= ActiveCap`');
      const clean = text.indexOf('Below cap + no Changes + CLEAN');
      assert.ok(increment >= 0 && cap > increment && clean > cap);
      assert.match(text, /BEFORE GOAL, Ask, CLEAN, fork, proceed, or re-dispatch/);
      assert.match(text, /Ask the operator per `AX_CAP_5`, regardless of verdict/);
      assert.match(text, /If Changes is empty, offer `CLEAN`.+if Changes is non-empty, omit CLEAN/s);
      assert.match(text, /No automatic next result exists/);
      assert.match(text, /SAME `LastResult`.+without incrementing it twice/s);
      assert.match(text, /`RESTART: reason`.+only disposition allowed to replace this state/s);
      const persist = text.indexOf('complete `sensor-result` event');
      const ask = text.indexOf('Ask the operator per `AX_CAP_5`');
      assert.ok(persist >= 0 && ask > persist, 'sensor result must be durable before cap Ask');
    }
    for (const text of [sourceGate2, builtGate2]) {
      assert.match(text, /result 5 or an\s+operator-raised cap always pauses.+even when it says CLEAN or exposes a new fork/s);
      assert.match(text, /cannot authorize round 6/);
    }
  });

  it('persists the sensor result and operator disposition as separate immutable events', () => {
    assert.match(persistedState, /`sensor-result`.+BEFORE interpreting.+GOAL, the cap.+Ask/s);
    assert.match(persistedState, /operator answer is a separate later\s+immutable `operator-disposition`/s);
    assert.match(persistedState, /with no disposition.+Ask pending\s+means re-present that same decision/s);
    assert.match(persistedState, /do not redispatch, increment, or\s+reset/s);
    assert.doesNotMatch(persistedState, /<ToolCall\b/);
    assert.equal(
      source.match(
        /<ToolCall\b[^>]*>npx gennady sdd-session log --content-file \.claude\/tmp\/sdd-scaffold-feasibility-event\.json<\/ToolCall>/g
      )?.length,
      3
    );
    assert.doesNotMatch(persistedState, /sdd-session log "|sdd-session term "/);

    for (const assembled of [sourceCritic, builtCritic]) {
      const foldAt = assembled.indexOf('First fold the matching persisted `FeasibilityState`');
      const dispatchAt = assembled.indexOf('may this step dispatch ONE isolated critic');
      const persistAt = assembled.indexOf('complete `sensor-result` event');
      const askAt = assembled.indexOf('Ask the operator per `AX_CAP_5`');
      assert.ok(foldAt >= 0 && dispatchAt > foldAt && persistAt > dispatchAt && askAt > persistAt);
      assert.match(
        assembled.slice(foldAt, dispatchAt),
        /without dispatching, incrementing, or resetting/
      );
      assert.equal(
        assembled.match(/<ToolCall\b[^>]*result="feasibilityEvent"/g)?.length,
        1,
        'assembled critic step owns one file-backed state append surface'
      );
    }
  });

  it('keeps planning manifest-free and gives the per-node loop three exhaustive typed task calls', () => {
    for (const generation of [sourceGeneration, builtGeneration]) {
      assert.match(generation, /Pass only the ordered node identities plus shared facts/);
      assert.match(generation, /create no\s+ticket content, files, or indexes here/);
      assert.doesNotMatch(generation, /sdd-new task|TaskManifest/);
    }

    const typedCalls = [
      [
        'flatInfraTaskManifest',
        'npx gennady sdd-new task --owner infrastructure-flat --scope <scope> --id <ACR>-<slug>',
      ],
      [
        'scopeBootstrapTaskManifest',
        'npx gennady sdd-new task --owner scope-bootstrap --scope <scope> --id <ACR>-<slug>',
      ],
      [
        'moduleTaskManifest',
        'npx gennady sdd-new task --owner module --scope <scope> --module <module> --id <ACR>-<slug>',
      ],
    ] as const;
    for (const loop of [sourceTicketLoop, builtTicketLoop]) {
      const taskCalls =
        loop.match(
          /<ToolCall\b[^>]*>npx gennady sdd-new task [\s\S]*?<\/ToolCall>/g
        ) ?? [];
      assert.equal(taskCalls.length, 3);
      for (const [result, call] of typedCalls) {
        assert.match(
          loop,
          new RegExp(
            `<ToolCall owner="this-step" result="${result}">${call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</ToolCall>`
          )
        );
      }
      assert.doesNotMatch(loop, /result="taskManifest"/);
      assert.match(loop, /This table is exhaustive;\s+interface maps to none/);
      assert.match(loop, /Select the current unprocessed STEP_2 node/);
      assert.match(loop, /result="phaseAuthoringFeedback"/);
      assert.match(loop, /GREEN authoringGate authorizes\s+selecting the next STEP_2 node/);
    }
  });

  it('reviews latest changed bytes and rejects a stale simultaneous CLEAN or fork', () => {
    for (const text of [sourceCritic, builtCritic]) {
      assert.match(text, /Changes non-empty.+latest bytes are unreviewed: re-dispatch/s);
      assert.match(text, /ignore any simultaneous CLEAN\/fork as stale/s);
      assert.match(text, /no Changes \+ CLEAN.+latest bytes are reviewed/s);
      assert.match(text, /never hand off unreviewed latest bytes/);
    }
  });

  it('uses one bounded full-context fallback without resetting the critic cycle', () => {
    for (const text of [sourceCritic, builtCritic]) {
      assert.match(text, /SAME worker session whenever it is alive/);
      assert.match(text, /only that live same-session\s+path may send just `ChangedTickets`/s);
      assert.match(text, /allow exactly ONE fresh\s+fallback critic/s);
      assert.match(text, /FULL `LatestTargetSet` plus the full retained\s+state\/context and complete prior result history/s);
      assert.match(text, /second fallback would be required.+pause with a teaching/s);
    }
    assert.match(
      [source, builtSkeleton].join('\n'),
      /required fresh fallback cannot receive the full latest target-set plus retained context\/history/
    );
  });

  it('keeps Gate 2 delta-only and routes its result through the same cap transition', () => {
    for (const text of [sourceGate2, builtGate2]) {
      assert.match(text, /Append those exact answers to `ApprovedGate2Choices`/);
      assert.match(text, /Do not ask again about choices already\s+recorded as approved/s);
      assert.match(text, /later card contains only\s+`PendingGate2Delta`/s);
      assert.match(text, /mandatory `increment → cap check → verdict\/Changes` transition/);
      assert.match(text, /fork result at\s+the active cap is disposed by `AX_CAP_5` BEFORE any delta card/s);
    }
  });
});
