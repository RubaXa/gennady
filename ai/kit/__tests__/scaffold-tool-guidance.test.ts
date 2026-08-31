// @file: Regression contract for compact, tool-guided scaffold authoring after draft.53–57.
// @consumers: scaffold.directive.hbs, build-directives
// @tasks: N/A

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const step = (text: string, id: string): string =>
  text.match(new RegExp(`<Step id="${id}">([\\s\\S]*?)<\\/Step>`))?.[1] ?? '';

describe('scaffold tool-guided authoring protocol', () => {
  const source = read('ai', 'kit', 'templates', 'sdd-v2', 'scaffold.directive.hbs');

  it('derives the bounded target set positively from typed router and spec-graph evidence', () => {
    const intake = step(source, 'STEP_0_INTAKE');
    assert.match(intake, /target set.+routerState.+portal edge\s+graph.+declared module links/is);
    assert.match(intake, /typed.+diagnostics.+next.+action/is);
    assert.doesNotMatch(
      intake,
      /Never replace a missing\/ambiguous target\s+with filesystem discovery, glob\/ls/s
    );
    assert.doesNotMatch(intake, /Do not issue an extra discovery command/);
  });

  it('leaves semantic rule selection in the prompt and mechanical evidence in authoring check', () => {
    const cascade = step(source, 'STEP_1_CASCADE');
    const generation = step(source, 'STEP_3_TASK_GENERATION');
    assert.match(cascade, /traversed-scopes tier/);
    assert.match(cascade, /target-scope tier/);
    assert.doesNotMatch(cascade, /resolve every rule ref to an existing file/);
    assert.doesNotMatch(source, /H_MISSING_RULE_FILE/);
    assert.doesNotMatch(source, /ax-rules-resolution-hard-fail/);
    assert.match(generation, /<Triggers>.+<SkipWhen>/s);
    assert.match(generation, /write the selected direct candidates into the phase `Rules:` bullet list/);
    assert.match(generation, /--authoring --phase <PhaseID>/);
    assert.match(generation, /missing.+unsafe.+transitive.+closure/is);
    assert.doesNotMatch(generation, /close the set over `<DependsOn>` transitively/);
    assert.doesNotMatch(generation, /open each included rule file/);
  });

  it('uses one compact new → fill → optional phase feedback → mandatory full GREEN loop', () => {
    const loop = step(source, 'STEP_3_TICKET_LOOP');
    assert.strictEqual(loop.match(/npx gennady sdd-new task /g)?.length, 3);
    assert.match(
      loop,
      /<ToolCall owner="this-step" result="phaseAuthoringFeedback">npx gennady sdd-check --task <created-ticket-path> --authoring --phase <PhaseID><\/ToolCall>/
    );
    assert.match(
      loop,
      /<ToolCall owner="this-step" result="authoringGate">npx gennady sdd-check --task <created-ticket-path> --authoring<\/ToolCall>/
    );
    assert.ok(loop.indexOf('authoringGate') < loop.indexOf('next STEP_2 node'));
    assert.match(loop, /at most three repair attempts.+H_TICKET_AUTHORING_INVALID/s);
    assert.doesNotMatch(loop, /filesystem discovery|glob\/ls|Do not inspect or plan|Never plan or create/);
  });

  it('finishes with a navigation Ask for execute-now versus stop-here', () => {
    const finalize = step(source, 'STEP_5_FINALIZE');
    assert.match(finalize, /AskUserQuestion/);
    assert.match(finalize, /execute now.+\/sdd-execute.+same session/is);
    assert.match(finalize, /stop here.+tickets.+session.+pause/is);
    assert.match(finalize, /navigation.+not.+approval gate/is);
  });

  it('propagates the source protocol into generated lazy step packages', () => {
    const generated = [
      read('ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_0_INTAKE.xml'),
      read('ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_1_CASCADE.xml'),
      read('ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_3_TASK_GENERATION.xml'),
      read('ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_3_TICKET_LOOP.xml'),
      read('ai', 'directives', 'sdd-v2', 'scaffold', 'steps', 'STEP_5_FINALIZE.xml'),
    ].join('\n');
    assert.match(generated, /result="phaseAuthoringFeedback"/);
    assert.match(generated, /result="authoringGate"/);
    assert.match(generated, /execute now.+\/sdd-execute/is);
    assert.doesNotMatch(generated, /filesystem discovery, glob\/ls/);
    assert.doesNotMatch(generated, /resolve every rule ref to an existing file/);
    assert.doesNotMatch(generated, /close the set over `<DependsOn>` transitively/);
  });
});
