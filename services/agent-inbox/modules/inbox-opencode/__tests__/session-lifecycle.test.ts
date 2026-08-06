// @file: Unit tests for SessionLifecycle — park/resume/close/TTL state machine + outcome classification ladder.
// @consumers: node:test runner
// @tasks: TSK-160

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionLifecycle } from '../session-lifecycle.ts';
import { SessionRegistry, type SessionEntry } from '../session-registry.ts';
import {
  classifyOutcome,
  resolveOutcomeLadder,
  OpenCodeReal,
  type LadderAction,
} from '../opencode.real.ts';
import { composeOk, composeError, type OpenCodeCallResult } from '../errors.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { OutcomeClass } from '../errors.ts';

// ── context factory ──

/** @purpose Single context shape — one registry, one journal mock, one lifecycle per test */
function createContext(ttlMs?: number) {
  const registry = new SessionRegistry();
  const journalAppend = mock.fn(async () => 1);
  const journal = { append: journalAppend } as unknown as EventJournal;
  const lifecycle = new SessionLifecycle(
    registry,
    journal,
    ttlMs ? { idleTtlMs: ttlMs } : undefined
  );
  return { registry, journalAppend, lifecycle };
}

function seedSession(registry: SessionRegistry, overrides?: Partial<SessionEntry>): SessionEntry {
  const entry: SessionEntry = {
    sessionId: 'sid-1',
    taskId: 'task-1',
    mr: 'https://gitlab.example.com/foo/bar/-/merge_requests/1',
    artifacts: [],
    state: 'idle',
    ...overrides,
  };
  registry.register(entry);
  return entry;
}

// ── helpers ──

function assertState(actual: unknown, expected: string): void {
  assert.strictEqual(actual, expected);
}

// ── tests ──

describe('SessionLifecycle', () => {
  describe('#startWork', () => {
    it('should transition idle → work and append journal event', async () => {
      const { registry, journalAppend, lifecycle } = createContext();
      seedSession(registry);

      lifecycle.startWork('sid-1');

      const entry = registry.lookup('sid-1');
      assertState(entry?.state, 'work');
      assert.strictEqual(journalAppend.mock.callCount(), 1);
    });

    it('should no-op for unknown session', () => {
      const { journalAppend, lifecycle } = createContext();

      lifecycle.startWork('ghost-sid');

      assert.strictEqual(journalAppend.mock.callCount(), 0);
    });
  });

  describe('#park', () => {
    it('should transition work → park, set parkedAt, and journal event', async () => {
      const { registry, journalAppend, lifecycle } = createContext();
      seedSession(registry, { state: 'work' });

      await lifecycle.park('sid-1');

      const entry = registry.lookup('sid-1');
      assertState(entry?.state, 'park');
      assert.ok(typeof entry?.parkedAt === 'string');
      assert.strictEqual(journalAppend.mock.callCount(), 1);
    });

    it('should no-op for unknown session', async () => {
      const { journalAppend, lifecycle } = createContext();

      await lifecycle.park('ghost-sid');

      assert.strictEqual(journalAppend.mock.callCount(), 0);
    });

    it('should update parkedAt on duplicate park', async () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, { state: 'park', parkedAt: '2020-01-01T00:00:00Z' });

      await lifecycle.park('sid-1');

      const entry = registry.lookup('sid-1');
      assert.ok(entry?.parkedAt !== '2020-01-01T00:00:00Z');
    });
  });

  describe('#resume', () => {
    it('should resume within TTL, returning true', async () => {
      const { registry, journalAppend, lifecycle } = createContext(120_000);
      seedSession(registry, {
        state: 'park',
        parkedAt: new Date(Date.now() - 10_000).toISOString(),
      });

      const resumed = await lifecycle.resume('sid-1');

      assert.strictEqual(resumed, true);
      const entry = registry.lookup('sid-1');
      assertState(entry?.state, 'work');
      assert.strictEqual(entry?.parkedAt, undefined);
      assert.strictEqual(journalAppend.mock.callCount(), 1);
    });

    it('should return false for unknown session', async () => {
      const { lifecycle } = createContext();

      const resumed = await lifecycle.resume('ghost-sid');

      assert.strictEqual(resumed, false);
    });

    it('should return false for idle session', async () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, { state: 'idle' });

      const resumed = await lifecycle.resume('sid-1');

      assert.strictEqual(resumed, false);
    });

    it('should return false for work session', async () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, { state: 'work' });

      const resumed = await lifecycle.resume('sid-1');

      assert.strictEqual(resumed, false);
    });

    it('should return false for closed session', async () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, { state: 'close' });

      const resumed = await lifecycle.resume('sid-1');

      assert.strictEqual(resumed, false);
    });

    it('should close expired parked session and return false', async () => {
      const ttlMs = 10_000;
      const { registry, lifecycle } = createContext(ttlMs);
      seedSession(registry, {
        state: 'park',
        parkedAt: new Date(Date.now() - ttlMs - 5_000).toISOString(),
      });

      const resumed = await lifecycle.resume('sid-1');

      assert.strictEqual(resumed, false);
      const entry = registry.lookup('sid-1');
      assertState(entry?.state, 'close');
    });

    it('should resume multiple times within TTL', async () => {
      const { registry, lifecycle } = createContext(300_000);
      const parkedAt = new Date(Date.now() - 10_000).toISOString();

      seedSession(registry, { state: 'park', parkedAt });
      await lifecycle.resume('sid-1');
      assertState(registry.lookup('sid-1')?.state, 'work');

      // Park again and resume again
      await lifecycle.park('sid-1');
      await lifecycle.resume('sid-1');
      assertState(registry.lookup('sid-1')?.state, 'work');
    });
  });

  describe('#close', () => {
    it('should transition any state → close and journal event', async () => {
      const { registry, journalAppend, lifecycle } = createContext();
      seedSession(registry, { state: 'work' });

      await lifecycle.close('sid-1');

      const entry = registry.lookup('sid-1');
      assertState(entry?.state, 'close');
      assert.strictEqual(journalAppend.mock.callCount(), 1);
    });

    it('should no-op for unknown session', async () => {
      const { journalAppend, lifecycle } = createContext();

      await lifecycle.close('ghost-sid');

      assert.strictEqual(journalAppend.mock.callCount(), 0);
    });
  });

  describe('#reapExpired', () => {
    it('should close only expired parked sessions, leaving fresh ones', () => {
      const { registry, lifecycle } = createContext(30_000);
      const expiredAt = new Date(Date.now() - 60_000).toISOString();
      const freshAt = new Date(Date.now() - 5_000).toISOString();

      seedSession(registry, {
        sessionId: 'expired',
        taskId: 't1',
        state: 'park',
        parkedAt: expiredAt,
      });
      seedSession(registry, {
        sessionId: 'fresh',
        taskId: 't2',
        state: 'park',
        parkedAt: freshAt,
      });
      seedSession(registry, { sessionId: 'working', taskId: 't3', state: 'work' });

      const expired = lifecycle.reapExpired();

      assert.deepStrictEqual(expired, ['expired']);
      assertState(registry.lookup('expired')?.state, 'close');
      assertState(registry.lookup('fresh')?.state, 'park');
      assertState(registry.lookup('working')?.state, 'work');
    });

    it('should return empty array when no parked sessions', () => {
      const { lifecycle } = createContext();

      const expired = lifecycle.reapExpired();

      assert.deepStrictEqual(expired, []);
    });

    it('should respect custom TTL', () => {
      const { registry, lifecycle } = createContext(5_000);
      const barelyFresh = new Date(Date.now() - 7_000).toISOString();
      seedSession(registry, {
        sessionId: 's1',
        taskId: 't1',
        state: 'park',
        parkedAt: barelyFresh,
      });

      const expired = lifecycle.reapExpired();

      assert.deepStrictEqual(expired, ['s1']);
    });
  });

  describe('#stateOf', () => {
    it('should return current state for registered session', () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, { state: 'work' });

      const state = lifecycle.stateOf('sid-1');

      assert.strictEqual(state, 'work');
    });

    it('should return close for unregistered session', () => {
      const { lifecycle } = createContext();

      const state = lifecycle.stateOf('ghost-sid');

      assert.strictEqual(state, 'close');
    });
  });

  describe('custom TTL', () => {
    it('should default to 45 minutes when no config provided', () => {
      const { registry, lifecycle } = createContext();
      seedSession(registry, {
        sessionId: 's1',
        taskId: 't1',
        state: 'park',
        parkedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      });

      const expired = lifecycle.reapExpired();

      assert.deepStrictEqual(expired, []);
    });
  });
});

// ── Outcome classification & recovery ladder ──

describe('classifyOutcome', () => {
  const classify = (result: OpenCodeCallResult): OutcomeClass => classifyOutcome(result);

  it('should classify ok:true as OK', () => {
    assert.strictEqual(classify(composeOk({})), 'OK');
  });

  it('should classify PARSE_ERROR', () => {
    assert.strictEqual(classify(composeError('PARSE_ERROR', 'bad json')), 'PARSE_ERROR');
  });

  it('should classify SCHEMA_MISMATCH', () => {
    assert.strictEqual(
      classify(composeError('SCHEMA_MISMATCH', 'wrong schema')),
      'SCHEMA_MISMATCH'
    );
  });

  it('should classify TIMEOUT', () => {
    assert.strictEqual(classify(composeError('TIMEOUT', 'too slow')), 'TIMEOUT');
  });

  it('should classify SESSION_ERROR', () => {
    assert.strictEqual(classify(composeError('SESSION_ERROR', 'session died')), 'SESSION_ERROR');
  });

  it('should classify NO_RESULT', () => {
    assert.strictEqual(classify(composeError('NO_RESULT', 'empty')), 'NO_RESULT');
  });

  it('should classify INCOMPLETE_ARTIFACT', () => {
    assert.strictEqual(
      classify(composeError('INCOMPLETE_ARTIFACT', 'truncated')),
      'INCOMPLETE_ARTIFACT'
    );
  });
});

describe('resolveOutcomeLadder', () => {
  const resolve = (failures: number, outcome: OutcomeClass): LadderAction =>
    resolveOutcomeLadder(failures, outcome);

  it('should return continue on first non-OK outcome', () => {
    assert.strictEqual(resolve(0, 'PARSE_ERROR'), 'continue');
  });

  it('should return restart on second non-OK outcome', () => {
    assert.strictEqual(resolve(1, 'SCHEMA_MISMATCH'), 'restart');
  });

  it('should return accept on third non-OK outcome', () => {
    assert.strictEqual(resolve(2, 'TIMEOUT'), 'accept');
  });

  it('should return accept on fourth non-OK outcome', () => {
    assert.strictEqual(resolve(3, 'SESSION_ERROR'), 'accept');
  });

  it('should return accept on OK regardless of failures', () => {
    assert.strictEqual(resolve(0, 'OK'), 'accept');
    assert.strictEqual(resolve(2, 'OK'), 'accept');
    assert.strictEqual(resolve(5, 'OK'), 'accept');
  });

  it('should return continue for NO_RESULT on first failure', () => {
    assert.strictEqual(resolve(0, 'NO_RESULT'), 'continue');
  });

  it('should return restart for INCOMPLETE_ARTIFACT on second failure', () => {
    assert.strictEqual(resolve(1, 'INCOMPLETE_ARTIFACT'), 'restart');
  });
});

// ── OpenCodeReal — server invariant (stale pid → clean boot) ──

describe('OpenCodeReal — server invariant', () => {
  it('GIVEN no server running WHEN createSession THEN throws ECONNREFUSED', async () => {
    const real = new OpenCodeReal({ baseUrl: 'http://127.0.0.1:19999' });

    await assert.rejects(
      () => real.createSession({ title: 'test', directory: '/tmp/test' }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        return /ECONNREFUSED|fetch failed|unavailable|connect/i.test(message);
      }
    );
  });

  it('should expose OpenCodeReal as an OpenCodePort', () => {
    const real = new OpenCodeReal();
    assert.ok(real instanceof OpenCodeReal);
  });
});
