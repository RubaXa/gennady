// @file: Negative structural guard for router state-call ownership and first-run session ordering.
// @consumers: public SDD skills, router.directive.hbs, build-directives
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

describe('router state/session execution order', () => {
  const router = read('ai', 'kit', 'templates', 'sdd-v2', 'router.directive.hbs');
  const builtRouter = read('ai', 'directives', 'sdd-v2', 'router.directive.xml');
  const state = step(router, 'STEP_0_STATE');
  const classify = step(router, 'STEP_1_CLASSIFY');
  const preflight = step(router, 'STEP_1B_PREFLIGHT');
  const preflightGate = read(
    'ai',
    'kit',
    'contract',
    'process',
    'readiness-preflight-gate.xml'
  );
  const skills = ['sdd', 'sdd-execute', 'sdd-scaffold', 'sdd-reconcile', 'sdd-critic'].map(
    (name) => [name, read('ai', 'skills', name, 'SKILL.md')] as const
  );

  it('gives the initial state call to the entry skill and passes one exact result alias', () => {
    for (const [name, skill] of skills) {
      assert.equal(skill.match(/npx gennady sdd-state/g)?.length, 1, `${name}: initial call count`);
      assert.match(
        skill,
        /<ToolCall owner="entry-skill" result="routerState">npx gennady sdd-state<\/ToolCall> Use routerState as the literal stdout snapshot\./
      );
      assert.match(skill, /router[\s\S]{0,100}never executes (?:that initial call|it) itself/);
    }
    assert.match(state, /Consume exact result alias `routerState`/);
    assert.doesNotMatch(state, /owner="this-step" result="stateSnapshot"/);
  });

  it('executes compatibility/open before either mutating preflight branch', () => {
    for (const assembled of [router, builtRouter]) {
      const orderedSteps = [...assembled.matchAll(/<Step id="([^"]+)">/g)].map(
        (match) => match[1]
      );
      assert.deepStrictEqual(orderedSteps.slice(0, 4), [
        'STEP_0_STATE',
        'STEP_1_CLASSIFY',
        'STEP_1B_PREFLIGHT',
        'STEP_2_ROUTE',
      ]);
      const assembledState = step(assembled, 'STEP_0_STATE');
      const assembledClassify = step(assembled, 'STEP_1_CLASSIFY');
      const assembledPreflight = step(assembled, 'STEP_1B_PREFLIGHT');
      assert.doesNotMatch(assembledState, /<ToolCall\b|READ_AND_USE_DIRECTIVE/);
      assert.match(assembledClassify, /result="sessionOpen"/);
      const effectivePreflight =
        assembled === router ? `${assembledPreflight}\n${preflightGate}` : assembledPreflight;
      assert.match(effectivePreflight, /migration-v1-v2\.directive\.xml/);
      assert.doesNotMatch(effectivePreflight, /readiness\.directive\.xml/);
    }
    assert.doesNotMatch(state, /readiness-preflight-gate|READ_AND_USE_DIRECTIVE/);
    assert.doesNotMatch(state, /<ToolCall\b/);
    assert.match(classify, /stored session becomes usable only\s+after compatibility is proved/s);
    assert.match(classify, /required sessionOpen succeeded/);
    assert.match(preflight, /legal here only because STEP_1 already proved or opened the owning session/);
    assert.match(preflight, /readiness-preflight-gate/);

    const compatibilityIndex = router.indexOf('<Step id="STEP_1_CLASSIFY">');
    const preflightIndex = router.indexOf('<Step id="STEP_1B_PREFLIGHT">');
    const readinessLoadIndex = router.indexOf('{{> "contract/process/readiness-preflight-gate"}}');
    assert.ok(
      compatibilityIndex >= 0 &&
        preflightIndex > compatibilityIndex &&
        readinessLoadIndex > preflightIndex,
      'assembled execution order must cross compatibility before any readiness/migration load'
    );
  });

  it('reuses only the migration-owned post-mutation snapshot and never refreshes in the router', () => {
    assert.doesNotMatch(router, /<ToolCall\b[^>]*>npx gennady sdd-state<\/ToolCall>/);
    assert.doesNotMatch(preflight, /readinessState|readiness arm/);
    assert.match(preflight, /activeRouterState = migrationState/);
    assert.match(preflight, /Do not run a router refresh after that return/);
    assert.match(preflight, /Readiness branches are routing decisions over `activeRouterState`/);

    const migration = read('ai', 'kit', 'templates', 'sdd-v2', 'migration-v1-v2.directive.hbs');
    assert.equal(
      migration.match(/<ToolCall\b[^>]*>npx gennady sdd-state<\/ToolCall>/g)?.length,
      1,
      'migration has only its final post-mutation snapshot'
    );
    assert.doesNotMatch(step(migration, 'STEP_0_SCAN'), /npx gennady sdd-state/);
    assert.match(migration, /result="migrationState"/);
  });

  it('owns session and glossary writes only after compatibility', () => {
    const language = read('ai', 'kit', 'axiom', 'process', 'ax-operator-language.xml');
    const session = read('ai', 'kit', 'contract', 'process', 'session-file-format.xml');
    assert.match(language, /Read-only critic\/audit\/code-review.+НИКОГДА не вызывают `sdd-session term`/s);
    assert.match(language, /GlossarySuggestions/);
    assert.doesNotMatch(language, /sdd-session term "</);
    assert.doesNotMatch(session, /<ToolCall\b/);
    assert.equal(
      classify.match(/<ToolCall\b[^>]*>npx gennady sdd-session term --content-file/g)?.length,
      1
    );
    assert.match(classify, /owner="compatible-stateful-orchestrator"/);
    assert.match(classify, /Only now may this stateful\s+orchestrator accept a `GlossarySuggestions` item/s);
    assert.doesNotMatch(state, /sdd-session term|glossaryUpdate/);
    assert.match(preflight, /branchJournal/);
    assert.ok(
      router.indexOf('required sessionOpen succeeded') < router.indexOf('result="branchJournal"'),
      'journal mutation must be textually and executably downstream of session readiness'
    );

    const readOnlyOwners = ['critic', 'audit', 'code-review'].map((name) =>
      read('ai', 'directives', 'sdd-v2', `${name}.directive.xml`)
    );
    assert.equal(
      builtRouter.match(
        /<ToolCall\b[^>]*>npx gennady sdd-session term --content-file \.claude\/tmp\/sdd-glossary-term\.txt<\/ToolCall>/g
      )?.length,
      1,
      'assembled router exposes the sole canonical glossary mutation'
    );
    for (const owner of readOnlyOwners) {
      assert.doesNotMatch(owner, /<ToolCall\b[^>]*>npx gennady sdd-session term/);
    }
  });
});
