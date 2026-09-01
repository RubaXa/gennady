// @file: Regression guard for scaffold's CLI-owned feasibility lifecycle across Gate 2.
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

  it('delegates lifecycle state and its next transition to the typed CLI contract', () => {
    for (const text of [sourceCritic, builtCritic]) {
      assert.match(text, /Start or resume only through `FEASIBILITY_STATE_FORMAT`/);
      assert.match(text, /obey the returned `NEXT=` instruction/);
      assert.match(text, /command\s+reconstructs the persisted cycle/);
      assert.doesNotMatch(text, /First fold the matching persisted `FeasibilityState`/);
      assert.doesNotMatch(text, /\| Event after a result \| Mandatory transition \|/);
    }
    assert.match(source, /contract\/scaffold\/feasibility-state-format/);
    assert.match(persistedState, /validated fold/);
    assert.match(persistedState, /CLI, not the model, owns sequence, result count, cap/);
    assert.match(persistedState, /activeCap:5/);
    assert.match(persistedState, /RESTART authorizes a new cycle/);
  });

  it('records every critic response before a CLI-owned cap, correction, or Gate 2 transition', () => {
    for (const text of [sourceCritic, builtCritic]) {
      const record = text.indexOf('Record every returned response as one `sensor-result`');
      const cap = text.indexOf('`NEXT=ASK_OPERATOR_CAP`');
      const gate = text.indexOf('`NEXT=PRESENT_GATE2`');
      assert.ok(record >= 0 && cap > record && gate > cap);
      assert.match(text, /records the answer as\s+`operator-disposition`/s);
      assert.match(text, /`NEXT=OPEN_RESTART_CYCLE` opens a\s+new typed cycle/s);
    }
    for (const text of [sourceGate2, builtGate2]) {
      assert.match(
        text,
        /result 5 or a raised cap returns\s+`NEXT=ASK_OPERATOR_CAP` before CLEAN or a fork can advance/s
      );
    }
  });

  it('uses only the file-backed typed feasibility command for state events', () => {
    assert.match(persistedState, /Each critic response is recorded exactly once as\s+`sensor-result\b/s);
    assert.match(
      persistedState,
      /before any correction, re-dispatch, Gate 2,\s+or cap decision/s
    );
    assert.doesNotMatch(persistedState, /<ToolCall\b/);
    assert.equal(
      source.match(
        /<ToolCall\b[^>]*>npx gennady sdd-session feasibility --content-file \.claude\/tmp\/sdd-scaffold-feasibility-event\.json<\/ToolCall>/g
      )?.length,
      3
    );
    assert.doesNotMatch(
      source,
      /sdd-session log --content-file \.claude\/tmp\/sdd-scaffold-feasibility-event/
    );
    assert.equal(
      sourceCritic.match(/<ToolCall\b[^>]*result="feasibilityEvent"/g)?.length,
      1
    );
  });

  it('keeps planning manifest-free and the per-node task calls exhaustive', () => {
    for (const generation of [sourceGeneration, builtGeneration]) {
      assert.match(generation, /Pass only the ordered node identities plus shared facts/);
      assert.match(generation, /create no\s+ticket content, files, or indexes here/);
      assert.doesNotMatch(generation, /sdd-new task|TaskManifest/);
    }
    const typedCalls = [
      'npx gennady sdd-new task --owner infrastructure-flat --scope <scope> --id <ACR>-<slug>',
      'npx gennady sdd-new task --owner scope-bootstrap --scope <scope> --id <ACR>-<slug>',
      'npx gennady sdd-new task --owner module --scope <scope> --module <module> --id <ACR>-<slug>',
    ];
    for (const loop of [sourceTicketLoop, builtTicketLoop]) {
      assert.equal(loop.match(/<ToolCall\b[^>]*>npx gennady sdd-new task /g)?.length, 3);
      for (const call of typedCalls) assert.ok(loop.includes(call));
      assert.match(loop, /This table is exhaustive;\s+interface maps to none/);
      assert.match(loop, /GREEN authoringGate authorizes\s+selecting the next STEP_2 node/);
    }
  });

  it('keeps changed bytes in the retained critic and a new fork unresolved until Gate 2', () => {
    for (const text of [sourceCritic, builtCritic]) {
      assert.match(
        text,
        /`NEW_FORK` plus one exact `fork` only for a no-change product\/toolchain delta/
      );
      assert.match(text, /it reaches Gate 2\s+unresolved/s);
      assert.match(text, /records `target-refreshed`, and follows `NEXT=REDISPATCH_CRITIC`/);
      assert.match(text, /Re-dispatch into the same live worker/);
      assert.match(text, /allow exactly one fallback/);
      assert.match(text, /full latest target set, critic-context, and prior result history/);
      assert.match(text, /a second fallback\s+or incomplete payload halts/s);
    }
    assert.match(
      [source, builtSkeleton].join('\n'),
      /required fresh fallback cannot receive the full latest target-set plus retained context\/history/
    );
  });

  it('keeps Gate 2 delta-only and sends its mutations back through the same lifecycle', () => {
    for (const text of [sourceGate2, builtGate2]) {
      assert.match(
        text,
        /record `gate2-choice \{choices,changedTickets\}` through feasibilityGate2Event/
      );
      assert.match(text, /Empty changedTickets permits `NEXT=FINALIZE`/);
      assert.match(text, /Non-empty changedTickets requires\s+`NEXT=REFRESH_TARGETS`/s);
      assert.match(text, /A critic `NEW_FORK` is presented as one delta-only card/);
    }
  });
});
