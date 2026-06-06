// @file: Type-level tests — verifies compile-time type safety of all element Props
// @consumers: prompt-kit QA
// @tasks: TSK-65

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  PromptProps,
  PrimaryGoalProps,
  BeliefStateProps,
  AxiomProps,
  HardForbiddenProps,
  SectionProps,
  ListProps,
  CodeProps,
  BoldProps,
  GroupProps,
  NodeProps,
} from '../index.js';
import {
  Prompt,
  PrimaryGoal,
  BeliefState,
  Axiom,
  HardForbidden,
  Section,
  List,
  Code,
  Bold,
  Group,
  Node,
} from '../index.js';
import type { PromptElement } from '../core/types.js';

describe('element prop types', () => {
  it('Prompt accepts keywords', () => {
    const p: PromptProps = { keywords: 'test' };
    assert.strictEqual(p.keywords, 'test');
  });

  it('PromptProps is optional', () => {
    const p: PromptProps = {};
    assert.strictEqual(p.keywords, undefined);
  });

  it('Axiom requires id', () => {
    const p: AxiomProps = { id: 'AX_1' };
    assert.strictEqual(p.id, 'AX_1');
  });

  it('Section requires title, optional id', () => {
    const withId: SectionProps = { title: 'T', id: 'x' };
    const withoutId: SectionProps = { title: 'T' };
    assert.strictEqual(withId.title, 'T');
    assert.strictEqual(withoutId.title, 'T');
  });

  it('List has ordered and title as optional', () => {
    const full: ListProps = { ordered: true, title: 'T' };
    const empty: ListProps = {};
    assert.strictEqual(full.ordered, true);
    assert.strictEqual(empty.ordered, undefined);
  });

  it('Code has lang and title as optional', () => {
    const full: CodeProps = { lang: 'ts', title: 'T' };
    const empty: CodeProps = {};
    assert.strictEqual(full.lang, 'ts');
    assert.strictEqual(empty.lang, undefined);
  });

  it('Group requires is, allows extra props', () => {
    const g: GroupProps = { is: 'Sdd', ver: '2.0' };
    assert.strictEqual(g.is, 'Sdd');
    assert.strictEqual(g.ver, '2.0');
  });

  it('Node requires is, allows id and extra props', () => {
    const withId: NodeProps = { is: 'CrossRef', id: 'ts-rules' };
    const withoutId: NodeProps = { is: 'File' };
    assert.strictEqual(withId.id, 'ts-rules');
    assert.strictEqual(withoutId.is, 'File');
  });

  it('Bold has no required props', () => {
    const p: BoldProps = {};
    assert.deepStrictEqual(p, {});
  });

  it('PrimaryGoal has no required props', () => {
    const p: PrimaryGoalProps = {};
    assert.deepStrictEqual(p, {});
  });

  it('BeliefState has no required props', () => {
    const p: BeliefStateProps = {};
    assert.deepStrictEqual(p, {});
  });

  it('HardForbidden has no required props', () => {
    const p: HardForbiddenProps = {};
    assert.deepStrictEqual(p, {});
  });

  it('all elements are PromptElement instances', () => {
    const elements: PromptElement[] = [
      Prompt,
      PrimaryGoal,
      BeliefState,
      Axiom,
      HardForbidden,
      Section,
      List,
      Code,
      Bold,
      Group,
      Node,
    ];
    for (const el of elements) {
      assert.strictEqual(typeof el.tagName, 'string');
      assert.strictEqual(typeof el.config, 'object');
      assert.strictEqual(typeof el.config.role, 'string');
    }
  });
});
