import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../index.js';

describe('elements', () => {
  it('should export all 9 primitives', () => {
    assert.strictEqual(typeof Prompt, 'object');
    assert.strictEqual(typeof PrimaryGoal, 'object');
    assert.strictEqual(typeof BeliefState, 'object');
    assert.strictEqual(typeof Axiom, 'object');
    assert.strictEqual(typeof HardForbidden, 'object');
    assert.strictEqual(typeof Section, 'object');
    assert.strictEqual(typeof List, 'object');
    assert.strictEqual(typeof Code, 'object');
    assert.strictEqual(typeof Bold, 'object');
  });

  it('should assign correct roles to each primitive', () => {
    assert.strictEqual(Prompt.config.role, 'root');
    assert.strictEqual(PrimaryGoal.config.role, 'section');
    assert.strictEqual(BeliefState.config.role, 'section');
    assert.strictEqual(Axiom.config.role, 'section');
    assert.strictEqual(HardForbidden.config.role, 'section');
    assert.strictEqual(Section.config.role, 'section');
    assert.strictEqual(List.config.role, 'list');
    assert.strictEqual(Code.config.role, 'block');
    assert.strictEqual(Bold.config.role, 'inline');
  });

  it('should have role-based config on each primitive', () => {
    for (const el of [
      Prompt, PrimaryGoal, BeliefState, Axiom, HardForbidden, Section, List, Code,
    ]) {
      assert.strictEqual(typeof el.config.markdown, 'object');
    }
    // Bold is inline — no markdown config needed
    assert.strictEqual(Bold.config.role, 'inline');
  });
});
