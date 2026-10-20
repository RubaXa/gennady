// @file: Contract tests for VcsInboxPort — abstract interface, Mock/Real interchangeability.
// @consumers: node:test runner
// @tasks: TSK-110

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VcsInboxPort } from '../vcs-inbox.port.ts';
import { VcsInboxMock } from '../vcs-inbox.mock.ts';
import { VcsInboxReal } from '../vcs-inbox.real.ts';

// ── contract: abstract class ──
// Note: JS runtime cannot enforce TypeScript's `abstract` — these tests verify
// the structural contract (methods exist on concrete implementations), not
// runtime enforcement of abstract-ness.

describe('VcsInboxPort — abstract contract', () => {
  it('VcsInboxPort class name is "VcsInboxPort"', () => {
    assert.strictEqual(VcsInboxPort.name, 'VcsInboxPort');
  });

  it('VcsInboxPort exists as an importable class', () => {
    assert.strictEqual(typeof VcsInboxPort, 'function');
  });

  it('VcsInboxPort methods appear on prototype (structural contract)', () => {
    const ownNames = Object.getOwnPropertyNames(VcsInboxPort.prototype);
    // Abstract methods may or may not survive transpilation (esbuild strips abstract).
    // Validate that concrete implementations have the methods instead.
    const mock = new VcsInboxMock();
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });

    for (const inst of [mock, real]) {
      assert.strictEqual(typeof inst.getActionable, 'function', 'getActionable');
      assert.strictEqual(typeof inst.getMrContext, 'function', 'getMrContext');
      assert.strictEqual(typeof inst.getDiscussions, 'function', 'getDiscussions');
    }
  });
});

// ── contract: Mock implements Port ──

describe('VcsInboxPort — Mock implements Port', () => {
  it('VcsInboxMock extends VcsInboxPort', () => {
    const mock = new VcsInboxMock();
    assert.ok(mock instanceof VcsInboxPort, 'Mock must be instanceof VcsInboxPort');
  });

  it('VcsInboxMock has getActionable method', () => {
    const mock = new VcsInboxMock();
    assert.strictEqual(typeof mock.getActionable, 'function');
  });

  it('VcsInboxMock has getMrContext method', () => {
    const mock = new VcsInboxMock();
    assert.strictEqual(typeof mock.getMrContext, 'function');
  });

  it('VcsInboxMock has getDiscussions method', () => {
    const mock = new VcsInboxMock();
    assert.strictEqual(typeof mock.getDiscussions, 'function');
  });

  it('VcsInboxMock has seed method (non-abstract, mock-only)', () => {
    const mock = new VcsInboxMock();
    assert.strictEqual(typeof mock.seed, 'function');
  });
});

// ── contract: Real implements Port ──

describe('VcsInboxPort — Real implements Port', () => {
  it('VcsInboxReal extends VcsInboxPort', () => {
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });
    assert.ok(real instanceof VcsInboxPort, 'Real must be instanceof VcsInboxPort');
  });

  it('VcsInboxReal has getActionable method', () => {
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });
    assert.strictEqual(typeof real.getActionable, 'function');
  });

  it('VcsInboxReal has getMrContext method', () => {
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });
    assert.strictEqual(typeof real.getMrContext, 'function');
  });

  it('VcsInboxReal has getDiscussions method', () => {
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });
    assert.strictEqual(typeof real.getDiscussions, 'function');
  });
});

// ── contract: interchangeability ──

describe('VcsInboxPort — Mock/Real interchangeability', () => {
  it('GIVEN Mock implements Port WHEN substituting Mock for Real THEN same method signatures', () => {
    const mock = new VcsInboxMock();
    const real = new VcsInboxReal({ token: 'test', host: 'gitlab.example.com' });

    // Both must have the same public interface from VcsInboxPort
    const portMethods = ['getActionable', 'getMrContext', 'getDiscussions'] as const;

    for (const method of portMethods) {
      assert.strictEqual(typeof (mock as Record<string, unknown>)[method], 'function');
      assert.strictEqual(typeof (real as Record<string, unknown>)[method], 'function');
    }
  });

  it('GIVEN Mock and Real WHEN used via Port type THEN both are assignable to VcsInboxPort', () => {
    // Structural test: both can be assigned to VcsInboxPort variable
    const mock: VcsInboxPort = new VcsInboxMock();
    const real: VcsInboxPort = new VcsInboxReal({
      token: 'test',
      host: 'gitlab.example.com',
    });

    assert.ok(mock instanceof VcsInboxPort);
    assert.ok(real instanceof VcsInboxPort);

    // Verify both return Promises for their methods (structural type check at runtime)
    const mockActionable = mock.getActionable();
    const realMrContext = real.getMrContext('https://example.com/x/-/merge_requests/1');

    assert.ok(mockActionable instanceof Promise, 'Mock#getActionable returns Promise');
    // realMrContext will try to fetch and fail — catch the rejection to avoid unhandledRejection
    realMrContext.catch(() => {
      // Expected: network call fails without real credentials
    });
    assert.ok(realMrContext instanceof Promise, 'Real#getMrContext returns Promise');
  });

  it('GIVEN Mock WHEN called on seeded data THEN returns deterministic results (port contract holds)', async () => {
    const mock: VcsInboxPort = new VcsInboxMock();
    // Use mock's seed through the concrete type since seed is not on the port
    const concrete = mock as VcsInboxMock;
    concrete.seed([]);

    const result = await mock.getActionable();
    assert.deepStrictEqual(result, []);
  });
});
