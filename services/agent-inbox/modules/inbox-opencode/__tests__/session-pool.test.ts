// @file: Unit tests for SessionPool — capacity, queuing without deadlock, release, cleanup.
// @consumers: node:test runner
// @tasks: TSK-111

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionPool, type SessionPoolConfig } from '../session-pool.ts';
import { OpenCodeMock } from '../opencode.mock.ts';
import type { OpenCodePort } from '../opencode.port.ts';

// ── helpers ──

function makeConfig(overrides?: Partial<SessionPoolConfig>): SessionPoolConfig {
  return {
    maxSessions: 3,
    opencode: new OpenCodeMock(),
    ...overrides,
  };
}

// ── tests ──

describe('SessionPool — basic lifecycle', () => {
  it('GIVEN pool with maxSessions=3 WHEN create() THEN returns sid and activeCount=1', async () => {
    const pool = new SessionPool(makeConfig());

    const sid = await pool.create({ title: 'test', directory: '/tmp/test' });

    assert.ok(sid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
  });

  it('GIVEN pool with 2 created sessions WHEN release(sid) THEN activeCount decrements', async () => {
    const pool = new SessionPool(makeConfig());

    const sid1 = await pool.create({ title: 'a', directory: '/tmp/a' });
    const sid2 = await pool.create({ title: 'b', directory: '/tmp/b' });
    assert.strictEqual(pool.activeCount(), 2);

    await pool.release(sid1);
    assert.strictEqual(pool.activeCount(), 1);

    await pool.release(sid2);
    assert.strictEqual(pool.activeCount(), 0);
  });

  it('GIVEN released session WHEN prompt(sid) THEN throws — sid not an active pool member', async () => {
    const pool = new SessionPool(makeConfig());
    const sid = await pool.create({ title: 'test', directory: '/tmp/test' });
    await pool.release(sid);

    await assert.rejects(() => pool.prompt(sid, { text: 'hello' }), /not an active pool member/);
  });

  it('GIVEN unknown sid WHEN prompt THEN throws', async () => {
    const pool = new SessionPool(makeConfig());

    await assert.rejects(
      () => pool.prompt('nonexistent-sid', { text: 'hello' }),
      /not an active pool member/
    );
  });
});

describe('SessionPool — queue without deadlock', () => {
  it('GIVEN pool limit=3 and 3 active WHEN 4th create THEN queued (awaits release)', async () => {
    const pool = new SessionPool(makeConfig({ maxSessions: 3 }));

    // Fill all slots
    await pool.create({ title: '1', directory: '/tmp/1' });
    await pool.create({ title: '2', directory: '/tmp/2' });
    await pool.create({ title: '3', directory: '/tmp/3' });
    assert.strictEqual(pool.activeCount(), 3);

    // 4th create — should not resolve immediately (queued)
    let queuedResolved = false;
    const queuedPromise = pool.create({ title: '4', directory: '/tmp/4' }).then((sid) => {
      queuedResolved = true;
      return sid;
    });

    // Give the microtask queue a chance to run
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(queuedResolved, false, '4th create should not resolve while pool is full');
    assert.strictEqual(pool.activeCount(), 3);

    // Cleanup rejects the queued promise — await the rejection to drain pending promises
    await pool.cleanup();
    await assert.rejects(() => queuedPromise, /create request cancelled/);
    assert.strictEqual(pool.activeCount(), 0);
  });

  it('GIVEN pool at capacity WHEN slot released THEN oldest queued create unblocks (FIFO)', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 2, opencode: mock });

    const sid1 = await pool.create({ title: '1', directory: '/tmp/1' });
    const sid2 = await pool.create({ title: '2', directory: '/tmp/2' });
    assert.strictEqual(pool.activeCount(), 2);

    // Queue two creates
    const p3 = pool.create({ title: '3', directory: '/tmp/3' });
    const p4 = pool.create({ title: '4', directory: '/tmp/4' });

    // Release first slot — p3 should resolve
    await pool.release(sid1);
    const sid3 = await p3;
    assert.ok(sid3.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 2, 'slot refilled from queue');

    // Release second slot — p4 should resolve
    await pool.release(sid2);
    const sid4 = await p4;
    assert.ok(sid4.startsWith('mock-session-'));
  });

  it('GIVEN pool at capacity WHEN cleanup called THEN queued requests rejected', async () => {
    const pool = new SessionPool(makeConfig({ maxSessions: 1 }));

    await pool.create({ title: '1', directory: '/tmp/1' });
    assert.strictEqual(pool.activeCount(), 1);

    // Queue a create
    const queuedPromise = pool.create({ title: '2', directory: '/tmp/2' });

    await pool.cleanup();

    await assert.rejects(() => queuedPromise, /create request cancelled/);
    assert.strictEqual(pool.activeCount(), 0);
  });
});

describe('SessionPool — prompt delegation', () => {
  it('GIVEN active session WHEN prompt THEN forwards to adapter and returns result', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 3, opencode: mock });

    const sid = await pool.create({ title: 'test', directory: '/tmp/test' });

    // Seed the adapter with a known response
    mock.seed('test-node', { kind: 'review', verdict: 'approved' });

    const result = await pool.prompt(sid, {
      text: 'test-node review',
      format: { type: 'json_schema', schema: { title: 'test-node', type: 'object' } },
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.output.kind, 'review');
      assert.strictEqual(result.output.verdict, 'approved');
    }
  });
});
