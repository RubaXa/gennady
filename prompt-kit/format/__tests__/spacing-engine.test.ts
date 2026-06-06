// @file: Unit tests for SpacingEngine — inter-element newline spacing by role adjacency
// @consumers: format module QA
// @tasks: TSK-63

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpacingEngine } from '../spacing-engine.js';

describe('SpacingEngine', () => {
  describe('#before', () => {
    it('should return empty string when role is inline', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('inline', 'section', 0), '');
      assert.strictEqual(engine.before('inline', null, 0), '');
    });

    it('should return empty string when previous role is null (first element)', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('section', null, 0), '');
      assert.strictEqual(engine.before('list', null, 0), '');
    });

    it('should return double newline between consecutive sections', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('section', 'section', 1), '\n\n');
    });

    it('should return double newline when previous role is block', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('section', 'block', 0), '\n\n');
    });

    it('should return double newline when current role is block', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('block', 'section', 0), '\n\n');
    });

    it('should return double newline when previous role is list', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('section', 'list', 1), '\n\n');
    });

    it('should return single newline when current role is list', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('list', 'section', 0), '\n');
    });

    it('should return single newline for unmatched role combinations', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.before('root', 'root', 0), '\n');
    });
  });

  describe('#after', () => {
    it('should return empty string when role is inline', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('inline', 'section', 0), '');
      assert.strictEqual(engine.after('inline', null, 0), '');
    });

    it('should return empty string when next role is null (last element)', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('section', null, 0), '');
    });

    it('should return double newline between consecutive sections', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('section', 'section', 1), '\n\n');
    });

    it('should return double newline when current role is block', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('block', 'section', 0), '\n\n');
    });

    it('should return double newline when next role is block', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('section', 'block', 0), '\n\n');
    });

    it('should return single newline when current role is list', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('list', 'section', 0), '\n');
    });

    it('should return double newline when next role is list', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('section', 'list', 1), '\n\n');
    });

    it('should return single newline for unmatched role combinations', () => {
      const engine = new SpacingEngine();
      assert.strictEqual(engine.after('root', 'root', 0), '\n');
    });
  });
});
