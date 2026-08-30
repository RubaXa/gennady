// @file: Regression guard for integrated critic ownership, session reuse, cap, and evidence lifecycle.
// @consumers: build-directives, sdd-critic

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf-8');
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('critic lifecycle contract', () => {
  const critic = read('ai', 'kit', 'templates', 'sdd-v2', 'critic.directive.hbs');
  const builtCritic = read('ai', 'directives', 'sdd-v2', 'critic.directive.xml');
  const protocol = read('ai', 'kit', 'templates', 'sdd-v2', 'critic-protocol.directive.hbs');
  const lifecycle = read('ai', 'kit', 'templates', 'sdd-v2', 'review-lifecycle.directive.hbs');
  const scope = read('ai', 'kit', 'templates', 'sdd-v2', 'scope.directive.hbs');
  const module = read('ai', 'kit', 'templates', 'sdd-v2', 'module.directive.hbs');
  const skill = read('ai', 'skills', 'sdd-critic', 'SKILL.md');
  const skillsReadme = read('ai', 'skills', 'README.md');
  const cap = read('ai', 'kit', 'axiom', 'process', 'ax-cap-5.xml');
  const scratch = read('ai', 'kit', 'axiom', 'process', 'ax-scratch-log.xml');
  const sensorState = read(
    'ai',
    'kit',
    'contract',
    'critic',
    'sensor-state-format.xml'
  );

  it('stores one integrated history and reviews every module after decomposition', () => {
    assert.match(critic, /one primary artifact only/);
    assert.match(critic, /sensor always reads the full review-set/);
    assert.match(critic, /edits only the manifest-derived\s+write-set/s);
    assert.match(critic, /- Write-set:/);
    assert.match(critic, /Changed-state:/);
    assert.match(critic, /Dispatch:/);
    assert.match(protocol, /decomposed scope \+ ALL its module specs/);
    assert.match(scope, /scope \+ ALL module specs/);
    assert.match(module, /scope spec plus\s+ALL module specs/s);
    assert.match(protocol, /absence from secondary artifacts is correct/);
  });

  it('owns continuation in the dispatch step rather than a global axiom', () => {
    assert.doesNotMatch(critic, /AX_CRITIC_SESSION_REUSE/);
    assert.match(critic, /continue that SAME worker\/session/);
    assert.match(critic, /changed-set.+full target-set is unchanged/s);
    assert.match(critic, /fresh — continuation unavailable/);
    assert.match(critic, /fresh — session lost/);
    assert.match(critic, /fresh — session failed/);
    assert.doesNotMatch(skill, /--session-id/);
  });

  it('asks only for GOAL forks or the cap, never to reconfirm mechanical severity', () => {
    const edit = step(critic, 'STEP_3_EDIT');
    const checkpoint = step(critic, 'STEP_3B_ROUND_CHECKPOINT');
    assert.match(edit, /Apply every `MECHANICAL` finding directly/);
    assert.match(checkpoint, /no unresolved `GOAL` exists.+skip the Ask/s);
    assert.match(checkpoint, /mechanical finding never creates a separate confirm-after-edit Ask/);
    assert.doesNotMatch(critic, /confirm\/correct block|fixed as follows:.*confirm/s);
  });

  it('blocks at every cap and never offers CLEAN for an edited sensor result', () => {
    assert.match(cap, /regardless\s+of sensor verdict/);
    assert.match(cap, /made no edits.+`CLEAN`/s);
    assert.match(cap, /if it made edits, CLEAN is unavailable/);
    assert.match(cap, /`CONTINUE THROUGH ROUND N`/);
    assert.match(cap, /`RESTART: reason`/);
    assert.match(critic, /If this round edited any write-set member, CLEAN is unavailable/);
    assert.doesNotMatch(
      [critic, lifecycle, cap].join('\n'),
      /ROUND 6 AUTHORIZED|Operator-decision: ACCEPTED|Round 5 CLEAN finishes/
    );
  });

  it('persists each sensor result/count before GOAL or cap Ask and resumes without redispatch', () => {
    for (const assembled of [critic, builtCritic]) {
      const persistAt = assembled.indexOf('<Step id="STEP_2C_PERSIST_SENSOR">');
      const goalAskAt = assembled.indexOf('<Step id="STEP_3B_ROUND_CHECKPOINT">');
      const capAskAt = assembled.indexOf('<Step id="STEP_3B2_CAP_DECISION">');
      assert.ok(persistAt >= 0 && goalAskAt > persistAt && capAskAt > persistAt);

      const resolve = step(assembled, 'STEP_0_RESOLVE');
      const dispatch = step(assembled, 'STEP_1_DISPATCH');
      const persist = step(assembled, 'STEP_2C_PERSIST_SENSOR');
      assert.match(resolve, /fold matching `CRITIC_SENSOR_STATE_FORMAT` events/);
      assert.match(resolve, /skip\s+STEP_1_DISPATCH through STEP_2C_PERSIST_SENSOR/s);
      assert.match(dispatch, /only when STEP_0 found no `resumePendingResult`/i);
      assert.equal(
        persist.match(/<ToolCall\b[^>]*result="criticSensorEvent"/g)?.length,
        1,
        'one executable sensor persistence occurs before the later Ask steps'
      );
      assert.doesNotMatch(
        assembled.slice(assembled.indexOf('<ExecutionPlan>'), persistAt),
        /AskUserQuestion/,
        'the assembled executable prefix cannot ask before sensor persistence'
      );
    }
    assert.match(sensorState, /Tool success is mandatory BEFORE\s+any artifact edit, GOAL\/cap Ask/s);
    assert.match(sensorState, /Every operator answer is a separate later immutable event/);
    assert.match(sensorState, /lacking a required disposition re-presents the recorded Ask/);
    assert.match(sensorState, /never redispatches\/increments/);
    assert.doesNotMatch(sensorState, /<ToolCall\b/);
    assert.equal(
      critic.match(
        /<ToolCall\b[^>]*>npx gennady sdd-session log --content-file \.claude\/tmp\/sdd-critic-event\.json<\/ToolCall>/g
      )?.length,
      4
    );
    assert.match(critic, /append its separate\s+immutable `goal-disposition` event/s);
    assert.match(critic, /append its separate immutable `cap-disposition` event/s);
  });

  it('documents the cap as an upper bound with early CLEAN and operator-only continuation', () => {
    assert.match(skill, /up to five automatic rounds; CLEAN ends earlier/);
    assert.match(skill, /after the fifth result requires explicit operator authorization/);
    assert.doesNotMatch(skill, /with five automatic rounds/);
    assert.match(skillsReadme, /до пяти автоматических раундов; CLEAN завершает раньше/);
    assert.match(skillsReadme, /после пятого продолжение возможно только по точной авторизации оператора/);
  });

  it('keeps one internal edit-loop owner and routes read-only findings without hidden edits', () => {
    assert.match(critic, /sole owner of its\s+edit\/re-dispatch loop/s);
    assert.match(critic, /finding that requires changing a read-only review-set member/);
    assert.match(critic, /write-set changed: <path\/reason>/);
    assert.match(critic, /Never edit it silently/);
    assert.match(lifecycle, /neither reconstructs that loop nor runs one critic per file/);
    assert.doesNotMatch(lifecycle, /Apply\s+its findings in place/);
  });

  it('keeps one global cap through semantic compression and removes scratch only after final approval', () => {
    assert.match(critic, /sdd-check --review-state <primary> \[secondary\.\.\.\]/);
    const finalStep = critic.indexOf('<Step id="STEP_5_FINALIZE">');
    const gate = critic.indexOf('reviewReadiness ToolCall below', finalStep);
    const publication = critic.indexOf('reviewPublication ToolCall below', finalStep);
    assert.ok(gate >= 0, 'readiness gate must exist');
    assert.ok(publication > gate, 'publication derivation must follow readiness');
    assert.match(critic.slice(finalStep), /Keep `## Critic Rounds` intact/);
    assert.match(critic.slice(finalStep), /review lifecycle removes it only after semantic finalization.+operator disposition/s);
    assert.match(
      critic.slice(finalStep),
      /<ToolCall\b[^>]*>npx gennady sdd-check --review-publication <primary> \[secondary\.\.\.\]<\/ToolCall>/
    );
    assert.match(critic, /auxiliary publication members never enter critic ownership/i);
    assert.match(scratch, /corrections continue the same numbered cycle.+cannot reset the five-result cap/s);
    const semantic = lifecycle.indexOf('<Step id="STEP_1_FINALIZE_SEMANTICS">');
    const approval = lifecycle.indexOf('<Step id="STEP_1B_OPERATOR_APPROVAL">');
    const integrated = lifecycle.indexOf('<Step id="STEP_2_INTERNAL_CRITIC">');
    const freeze = lifecycle.indexOf('<Step id="STEP_2B_FREEZE_FINAL_BYTES">');
    assert.ok(semantic >= 0 && approval > semantic && integrated > approval && freeze > integrated);
    assert.match(lifecycle.slice(semantic, integrated), /preserve the section and its round numbering exactly/s);
    assert.match(lifecycle.slice(integrated, freeze), /never resets the global count/s);
    assert.match(lifecycle.slice(freeze), /Remove\s+`## Critic Rounds` LAST.+accepted terminal Approval/s);
    assert.match(lifecycle, /neither reconstructs that loop/);
  });

  it('places module final approval before review, publication, merge, and scaffold handoff', () => {
    const final = module.match(/<Step id="STEP_6_FINAL_HIERARCHY">([\s\S]*?)<\/Step>/)?.[1] ?? '';
    const approval = final.indexOf('Approval Check. STOP');
    const review = final.indexOf('integrated critic');
    const publication = final.indexOf('publish the');
    const merge = final.indexOf('merge the same reviewed commit');
    const handoff = final.indexOf('hand off to scaffold');
    assert.ok(approval >= 0 && review > approval && publication > review && merge > publication);
    assert.ok(handoff > merge);
    assert.match(final, /only its unsettled delta/);
    assert.doesNotMatch(final.slice(handoff), /Approval Check/);
  });

  it('spells exact mechanical commands at their ownership points', () => {
    assert.match(critic, /npx gennady sdd-orient <artifact-path>/);
    assert.match(protocol, /npx gennady sdd-extract <dep-spec> VISION/);
    assert.match(critic, /npx gennady sdd-check --review-ready <bundle-path>/);
    assert.match(
      critic,
      /npx gennady sdd-check --review-publication <primary> \[secondary\.\.\.\]/
    );
  });
});
