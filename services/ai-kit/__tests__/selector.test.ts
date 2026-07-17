// @file: Unit + contract tests for services/ai-kit/selector.ts — selectDirective base-template
//   choice and additive mrShape-brick composition (TSK-136, D-121/D-122/D-123, AI-42/43/44).
// @consumers: node:test runner
// @tasks: TSK-136

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { selectDirective, DirectiveSelectionError } from '../selector.ts';
import type { SessionType, Track } from '../selector.ts';
import type { MrShape } from '../../agent-inbox/modules/inbox-core/context-builder.ts';

/**
 * Test Graph:
 * └── selectDirective()
 *     ├── selectDirective always includes mission bricks
 *     ├── selectDirective picks base template by track
 *     ├── selectDirective picks code-lens.directive.hbs for track code
 *     ├── newSymbols adds dedup step
 *     ├── isTiny adds AX_MINIMAL_CHANGE_SUSPICION
 *     ├── filterMapChain adds reduce step
 *     ├── nestedLoops adds complexity step
 *     ├── multiple mrShape flags compose additively
 *     ├── securityHits and depManifest do not change brick set
 *     └── selectDirective renders real hbs+axiom files from disk
 */

const NO_FLAGS: MrShape = {
  newSymbols: false,
  nestedLoops: false,
  filterMapChain: false,
  isTiny: false,
  securityHits: false,
  depManifest: false,
};

describe('selectDirective', () => {
  it('selectDirective always includes mission bricks', () => {
    // contract: any valid (sessionType, track, mrShape-with-no-flags) carries the four
    // mission-adequacy bricks; an unresolved pair fails typed, never silently empty
    const result = selectDirective('session', 'logic', NO_FLAGS);

    assert.ok(result.length > 0, 'assembled directive should not be empty');
    assert.match(result, /AX_REVIEW_PURPOSE/);
    assert.match(result, /AX_SIMPLER_ALTERNATIVE/);
    assert.match(result, /AX_COMPLEXITY_BUDGET/);
    assert.match(result, /AX_NO_DUPLICATION/);

    assert.throws(
      () => selectDirective('bogus' as SessionType, 'logic', NO_FLAGS),
      (error: unknown) => {
        assert.ok(error instanceof DirectiveSelectionError);
        assert.match((error as Error).message, /No base template/);
        return true;
      }
    );
  });

  it('selectDirective picks base template by track', () => {
    const logicResult = selectDirective('session', 'logic', NO_FLAGS);
    const securityResult = selectDirective('session', 'security', NO_FLAGS);

    assert.match(logicResult, /<ArchInterrogation/);
    assert.match(securityResult, /<SecurityInterrogation/);
    assert.notStrictEqual(logicResult, securityResult);
  });

  it('selectDirective picks code-lens.directive.hbs for track code', () => {
    const codeResult = selectDirective('session', 'code', NO_FLAGS);
    const logicResult = selectDirective('session', 'logic', NO_FLAGS);
    const securityResult = selectDirective('session', 'security', NO_FLAGS);

    assert.match(codeResult, /<CodeInterrogation/);
    assert.notStrictEqual(codeResult, logicResult);
    assert.notStrictEqual(codeResult, securityResult);
  });

  it('newSymbols adds dedup step', () => {
    const withFlag = selectDirective('session', 'logic', { ...NO_FLAGS, newSymbols: true });
    const without = selectDirective('session', 'logic', NO_FLAGS);

    assert.match(withFlag, /STEP_DEDUP_NEW_SYMBOL/);
    assert.doesNotMatch(without, /STEP_DEDUP_NEW_SYMBOL/);
  });

  it('isTiny adds AX_MINIMAL_CHANGE_SUSPICION', () => {
    const withFlag = selectDirective('session', 'logic', { ...NO_FLAGS, isTiny: true });
    const without = selectDirective('session', 'logic', NO_FLAGS);

    assert.match(withFlag, /AX_MINIMAL_CHANGE_SUSPICION/);
    assert.doesNotMatch(without, /AX_MINIMAL_CHANGE_SUSPICION/);
  });

  it('filterMapChain adds reduce step', () => {
    const withFlag = selectDirective('session', 'logic', { ...NO_FLAGS, filterMapChain: true });
    const without = selectDirective('session', 'logic', NO_FLAGS);

    assert.match(withFlag, /STEP_REDUCE_CANDIDATE/);
    assert.doesNotMatch(without, /STEP_REDUCE_CANDIDATE/);
  });

  it('nestedLoops adds complexity step', () => {
    // invariant: complexity step reuses ax-scale-proportional-depth — assert both the step id
    // and the reused axiom id, not just the wrapper
    const withFlag = selectDirective('session', 'logic', { ...NO_FLAGS, nestedLoops: true });
    const without = selectDirective('session', 'logic', NO_FLAGS);

    assert.match(withFlag, /STEP_NESTED_LOOP_COMPLEXITY/);
    assert.match(withFlag, /AX_SCALE_PROPORTIONAL_DEPTH/);
    assert.doesNotMatch(without, /STEP_NESTED_LOOP_COMPLEXITY/);
    assert.doesNotMatch(without, /AX_SCALE_PROPORTIONAL_DEPTH/);
  });

  it('multiple mrShape flags compose additively', () => {
    // non-goal: does not assert absence of other steps — only that both triggered steps coexist
    const result = selectDirective('session', 'logic', {
      ...NO_FLAGS,
      newSymbols: true,
      nestedLoops: true,
    });

    assert.match(result, /STEP_DEDUP_NEW_SYMBOL/);
    assert.match(result, /STEP_NESTED_LOOP_COMPLEXITY/);
  });

  it('securityHits and depManifest do not change brick set', () => {
    // §5.3.1: these two flags are depth modulators inside the security-lens content itself,
    // never selector-level triggers — the assembled directive is byte-identical either way
    const withHits = selectDirective('session', 'security', {
      ...NO_FLAGS,
      securityHits: true,
      depManifest: true,
    });
    const without = selectDirective('session', 'security', NO_FLAGS);

    assert.strictEqual(withHits, without);
  });

  it('selectDirective renders real hbs+axiom files from disk', () => {
    // integration: real ai/kit/render.ts + real hbs/xml on disk, no in-memory template stub —
    // the rendered output must carry no unresolved Handlebars partial/conditional syntax
    const result = selectDirective('session', 'logic', { ...NO_FLAGS, newSymbols: true });

    assert.match(result, /<ArchInterrogation/);
    assert.doesNotMatch(result, /\{\{[>#/]/);
  });
});

describe('selectDirective — synthesize sessionType', () => {
  it('resolves synthesize.directive.hbs regardless of track', () => {
    const result = selectDirective('synthesize', undefined as unknown as Track, NO_FLAGS);

    assert.match(result, /<SynthesizeReview/);
  });
});
