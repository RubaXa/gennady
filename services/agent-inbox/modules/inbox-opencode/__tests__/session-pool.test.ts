// @file: Unit tests for SessionPool — capacity, queuing without deadlock, release, cleanup.
// @consumers: node:test runner
// @tasks: TSK-111, TSK-160

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionPool,
  UnifiedPool,
  type SessionPoolConfig,
  type SessionPriority,
} from '../session-pool.ts';
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

describe('SessionPool — priority queuing (operator > reviewer > background)', () => {
  it('GIVEN pool at capacity WHEN operator and background queued THEN operator dequeues first', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock });
    const fillerSid = await pool.create({ title: 'filler', directory: '/tmp/fill' });
    assert.strictEqual(pool.activeCount(), 1);

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });
    const op = pool.create({ title: 'op', directory: '/tmp/op', priority: 'operator' });
    assert.strictEqual(pool.queueDepth(), 2);

    await pool.release(fillerSid);

    // operator must get the slot — resolves immediately
    const opSid = await op;
    assert.ok(opSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 1);

    // background is still queued
    await pool.cleanup();
    await assert.rejects(() => bg, /create request cancelled/);
  });

  it('GIVEN pool at capacity WHEN reviewer and background queued THEN reviewer dequeues first', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock });
    const fillerSid = await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });
    const rv = pool.create({ title: 'rv', directory: '/tmp/rv', priority: 'reviewer' });

    await pool.release(fillerSid);

    const rvSid = await rv;
    assert.ok(rvSid.startsWith('mock-session-'));
    assert.strictEqual(pool.queueDepth(), 1);

    await pool.cleanup();
    await assert.rejects(() => bg, /create request cancelled/);
  });

  it('GIVEN pool at capacity WHEN two same-priority creates queued THEN FIFO applies', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock });
    await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const first = pool.create({ title: 'first', directory: '/tmp/first', priority: 'background' });
    const second = pool.create({
      title: 'second',
      directory: '/tmp/second',
      priority: 'background',
    });

    await pool.release('mock-session-1');

    const firstSid = await first;
    assert.ok(firstSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 1);

    await pool.cleanup();
    await assert.rejects(() => second, /create request cancelled/);
  });

  it('GIVEN pool with background-only requests WHEN release THEN no preemption of active slots', async () => {
    const pool = new SessionPool(makeConfig({ maxSessions: 2 }));
    const sid1 = await pool.create({ title: 'bg1', directory: '/tmp/bg1', priority: 'background' });
    const sid2 = await pool.create({ title: 'bg2', directory: '/tmp/bg2', priority: 'background' });
    assert.strictEqual(pool.activeCount(), 2);

    // queue an operator — must NOT preempt active slots
    const op = pool.create({ title: 'op', directory: '/tmp/op', priority: 'operator' });
    assert.strictEqual(pool.queueDepth(), 1);
    assert.strictEqual(pool.activeCount(), 2);

    // release one slot → operator gets it
    await pool.release(sid1);
    const opSid = await op;
    assert.ok(opSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 2);

    await pool.cleanup();
  });

  it('GIVEN empty pool WHEN create THEN activeCount=1, queueDepth=0', async () => {
    const pool = new SessionPool(makeConfig());

    assert.strictEqual(pool.activeCount(), 0);
    assert.strictEqual(pool.queueDepth(), 0);

    const sid = await pool.create({ title: 'test', directory: '/tmp/test' });
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 0);
  });
});

describe('SessionPool — aging (background bumps after threshold)', () => {
  it('GIVEN agingThresholdMs=0 WHEN background queued THEN no priority bump', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock, agingThresholdMs: 0 });
    await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });
    const rv = pool.create({ title: 'rv', directory: '/tmp/rv', priority: 'reviewer' });

    await pool.release('mock-session-1');
    const rvSid = await rv;
    assert.ok(rvSid.startsWith('mock-session-'));

    await pool.cleanup();
    await assert.rejects(() => bg, /create request cancelled/);
  });

  it('GIVEN aging enabled WHEN background waits past threshold THEN beats later reviewer', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock, agingThresholdMs: 1 });
    await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });

    // wait past the tiny aging threshold so effective priority bumps to reviewer (1)
    await new Promise((resolve) => setTimeout(resolve, 10));

    const rv = pool.create({ title: 'rv', directory: '/tmp/rv', priority: 'reviewer' });

    await pool.release('mock-session-1');
    // aged background now has effective priority 1 (reviewer), same as rv
    // within tier, FIFO → bg (enqueued earlier) wins
    const bgSid = await bg;
    assert.ok(
      bgSid.startsWith('mock-session-'),
      'aged background should beat later reviewer via FIFO'
    );

    await pool.cleanup();
    await assert.rejects(() => rv, /create request cancelled/);
  });

  it('GIVEN aging threshold large WHEN background queued briefly THEN no bump', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock, agingThresholdMs: 60_000 });
    await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });
    const rv = pool.create({ title: 'rv', directory: '/tmp/rv', priority: 'reviewer' });

    await pool.release('mock-session-1');
    const rvSid = await rv;
    assert.ok(rvSid.startsWith('mock-session-'));

    await pool.cleanup();
    await assert.rejects(() => bg, /create request cancelled/);
  });
});

describe('SessionPool — backward compatibility', () => {
  it('GIVEN create without priority WHEN default applies THEN priority is background (FIFO-ish)', async () => {
    const pool = new SessionPool(makeConfig());

    const sid1 = await pool.create({ title: 'a', directory: '/tmp/a' });
    const sid2 = await pool.create({ title: 'b', directory: '/tmp/b' });

    assert.ok(sid1.startsWith('mock-session-'));
    assert.ok(sid2.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 2);
  });

  it('UnifiedPool alias is a SessionPool instance', () => {
    const pool = new UnifiedPool({ maxSessions: 3, opencode: new OpenCodeMock() });
    assert.ok(pool instanceof SessionPool);
  });
});

describe('SessionPool — release + reassign cycle (3 pending, 1 slot)', () => {
  it('GIVEN queue of 3 creates WHEN released one by one THEN resolve in priority order', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 1, opencode: mock });
    const fillerSid = await pool.create({ title: 'filler', directory: '/tmp/fill' });

    const bg = pool.create({ title: 'bg', directory: '/tmp/bg', priority: 'background' });
    const rv = pool.create({ title: 'rv', directory: '/tmp/rv', priority: 'reviewer' });
    const op = pool.create({ title: 'op', directory: '/tmp/op', priority: 'operator' });
    assert.strictEqual(pool.queueDepth(), 3);

    // Release 1 → operator wins
    await pool.release(fillerSid);
    const opSid = await op;
    assert.ok(opSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 2);

    // Release 2 → reviewer wins (remaining: rv, bg)
    await pool.release(opSid);
    const rvSid = await rv;
    assert.ok(rvSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 1);

    // Release 3 → background gets slot
    await pool.release(rvSid);
    const bgSid = await bg;
    assert.ok(bgSid.startsWith('mock-session-'));
    assert.strictEqual(pool.activeCount(), 1);
    assert.strictEqual(pool.queueDepth(), 0);

    await pool.cleanup();
  });
});

describe('SessionPool — continueSignal delegation', () => {
  it('GIVEN active session WHEN continueSignal THEN forwards to adapter', async () => {
    const mock = new OpenCodeMock();
    const pool = new SessionPool({ maxSessions: 3, opencode: mock });

    const sid = await pool.create({ title: 'test-node', directory: '/tmp/test' });
    mock.seed('test-node', { kind: 'recovery', status: 'fixed' });

    const result = await pool.continueSignal(sid, { text: 'retry' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.output.kind, 'recovery');
    }
  });

  it('GIVEN inactive session WHEN continueSignal THEN throws', async () => {
    const pool = new SessionPool(makeConfig());
    const sid = await pool.create({ title: 'test', directory: '/tmp/test' });
    await pool.release(sid);

    await assert.rejects(
      () => pool.continueSignal(sid, { text: 'retry' }),
      /not an active pool member/
    );
  });
});
