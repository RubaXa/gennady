// @file: Structural contract for /sdd-execute selection, routing barriers, and bounded planning.
// @consumers: sdd-execute skill, router.directive.hbs, execute.directive.hbs, build-directives
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('/sdd-execute selection and orchestration barriers', () => {
  const skill = read('ai', 'skills', 'sdd-execute', 'SKILL.md');
  const router = read('ai', 'kit', 'templates', 'sdd-v2', 'router.directive.hbs');
  const execute = read('ai', 'kit', 'templates', 'sdd-v2', 'execute.directive.hbs');
  const builtRouter = read('ai', 'directives', 'sdd-v2', 'router.directive.xml');
  const builtExecute = read('ai', 'directives', 'sdd-v2', 'execute.directive.xml');
  const progress = read(
    'ai',
    'kit',
    'contract',
    'process',
    'orchestrator-progress-format.xml'
  );

  it('treats an empty payload as selection, never as implicit next', () => {
    const embody = step(skill, 'EMBODY');
    const resolve = step(execute, 'STEP_0_RESOLVE');

    assert.match(embody, /empty\s+payload.+selection.+not `next`/is);
    assert.match(
      resolve,
      /WHEN intent payload is empty.+show.+operator selection.+executionMap.+TerminalDecision: pause/s
    );
    assert.match(resolve, /do not enter STEP_1_PLAN.+until the operator selects/is);
    assert.doesNotMatch(resolve, /empty.+first pickable/s);
  });

  it('models empty, one, many, and explicit selectors as disjoint branches', () => {
    const resolve = step(execute, 'STEP_0_RESOLVE');

    assert.match(resolve, /specific Task-ID \/ ticket path.+STEP_1–8/s);
    assert.match(resolve, /`next` \/ `pick`.+exactly one pickable.+auto-select/s);
    assert.match(resolve, /`next` \/ `pick`.+zero pickable.+H_NO_TASKS/s);
    assert.match(
      resolve,
      /`next` \/ `pick`.+two or more pickable.+H_AMBIGUOUS_TASK.+ticket-path/s
    );
    assert.doesNotMatch(resolve, /first pickable from the map/);
  });

  it('keeps Router SHOW as a visible barrier before probes, session mutation, and owner load', () => {
    for (const source of [router, builtRouter]) {
      const stateAt = source.indexOf('<Step id="STEP_0_STATE">');
      const showAt = source.indexOf('SHOW-gate', stateAt);
      const classifyAt = source.indexOf('<Step id="STEP_1_CLASSIFY">', stateAt);
      const firstSessionMutationAt = source.indexOf('npx gennady sdd-session ', classifyAt);
      const routeAt = source.indexOf('<Step id="STEP_2_ROUTE">', classifyAt);
      const ownerLoadAt = source.indexOf(
        'READ_AND_USE_DIRECTIVE("ai/directives/sdd-v2/execute.directive.xml")',
        routeAt
      );

      assert.ok(
        stateAt >= 0 &&
          showAt > stateAt &&
          classifyAt > showAt &&
          firstSessionMutationAt > classifyAt &&
          routeAt > firstSessionMutationAt &&
          ownerLoadAt > routeAt,
        'SHOW must precede classification, session mutation, and execute-owner load'
      );
      assert.doesNotMatch(step(source, 'STEP_0_STATE'), /<ToolCall\b|READ_AND_USE_DIRECTIVE/);
      assert.match(step(source, 'STEP_0_STATE'), /End this step after display/);
      assert.match(
        step(source, 'STEP_1_CLASSIFY'),
        /executeSessionMode.+reused execute@<working-set>.+fresh \(first\).+fresh \(intent-switch\)/s
      );
      assert.match(step(source, 'STEP_2_ROUTE'), /pass the exact `executeSessionMode`/);
    }
  });

  it('bounds pre-dispatch orchestration to map, selected plan, round log, and worker-owned phase context', () => {
    const planning = [
      step(execute, 'STEP_0_RESOLVE'),
      step(execute, 'STEP_0B_PREFLIGHT'),
      step(execute, 'STEP_1_PLAN'),
    ].join('\n');
    const toolCalls = [...planning.matchAll(/<ToolCall\b[^>]*>([\s\S]*?)<\/ToolCall>/g)].map(
      (match) => match[1]
    );

    assert.deepStrictEqual(toolCalls, [
      'npx gennady sdd-task',
      'npx gennady sdd-task <ticket>',
      'npx gennady sdd-log <ticket> round "execute <Task-ID>"',
    ]);
    assert.match(
      planning,
      /Do not inspect `package\.json`, read\s+`specs\/\.sdd-session\.md`, glob the repository, or read a whole spec \/ phase body/s
    );
    assert.doesNotMatch(planning, /resolve.+`@tasks:`.+read the header/s);

    const dispatch = step(execute, 'STEP_2_DISPATCH');
    assert.match(
      dispatch,
      /<ToolCall owner="phase-worker" result="phaseContext">npx gennady sdd-task <id-or-path> --phase <PhaseID><\/ToolCall>/
    );
    assert.doesNotMatch(
      dispatch,
      /<ToolCall owner="this-step"[^>]*>npx gennady sdd-task [^<]*--phase/
    );
  });

  it('uses one compact task/stage/session progress grammar in source and generated directive', () => {
    const canonical =
      '`[<bar>] <pct>% | task=<Task-ID|selection> | stage=<stage> | session=<reused <kind>@<spec>|fresh (<reason>)>`';

    assert.ok(progress.includes(canonical));
    assert.match(progress, /Every progress message uses exactly this one-line grammar/);
    assert.match(execute, /orchestrator-progress-format/);
    assert.ok(builtExecute.includes(canonical));
    assert.doesNotMatch(builtExecute, /\[<bar>\] <pct>% \| <Task-ID> \| <stage>/);
  });
});
