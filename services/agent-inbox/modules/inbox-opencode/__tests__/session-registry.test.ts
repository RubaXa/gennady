// @file: Unit tests for SessionRegistry — sessionId ↔ {taskId, mr, artifacts[], model} in-memory store.
// @consumers: node:test runner
// @tasks: TSK-160

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRegistry, type SessionEntry } from '../session-registry.ts';

function makeEntry(overrides?: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: 'sess-1',
    taskId: 'task-42',
    mr: 'https://gitlab.example.com/foo/bar/-/merge_requests/1',
    artifacts: ['review.md'],
    state: 'idle' as const,
    ...overrides,
  };
}

function seededRegistry(entries: SessionEntry[]): SessionRegistry {
  const registry = new SessionRegistry();
  for (const entry of entries) registry.register(entry);
  return registry;
}

// ── tests ──

describe('SessionRegistry', () => {
  describe('#register', () => {
    it('should store entry by sessionId with taskId, mr, artifacts and model', () => {
      // contract: register stores full SessionEntry keyed by sessionId
      const registry = new SessionRegistry();
      const entry = makeEntry({ model: 'gpt-4' });

      registry.register(entry);

      const stored = registry.lookup('sess-1');
      assert.deepStrictEqual(stored, entry);
    });

    it('should overwrite existing entry with same sessionId', () => {
      // contract: register on existing key replaces the entry — idempotent re-registration
      const registry = seededRegistry([makeEntry({ taskId: 'old-task' })]);
      const replacement = makeEntry({ taskId: 'new-task', artifacts: ['new.md'] });

      registry.register(replacement);

      const stored = registry.lookup('sess-1');
      assert.deepStrictEqual(stored, replacement);
      assert.strictEqual(stored?.taskId, 'new-task');
      assert.deepStrictEqual(stored?.artifacts, ['new.md']);
    });
  });

  describe('#lookup', () => {
    it('should return full SessionEntry for registered sessionId', () => {
      // contract: lookup returns the exact stored entry
      const entry = makeEntry({ model: 'claude-3' });
      const registry = seededRegistry([entry]);

      const result = registry.lookup('sess-1');

      assert.deepStrictEqual(result, entry);
      assert.strictEqual(result?.taskId, 'task-42');
      assert.strictEqual(result?.mr, 'https://gitlab.example.com/foo/bar/-/merge_requests/1');
      assert.deepStrictEqual(result?.artifacts, ['review.md']);
      assert.strictEqual(result?.model, 'claude-3');
    });

    it('should return undefined for unknown sessionId', () => {
      // contract: missing key → undefined, not throw
      const registry = new SessionRegistry();

      const result = registry.lookup('no-such-session');

      assert.strictEqual(result, undefined);
    });
  });

  describe('#update', () => {
    it('should modify fields for registered entry', () => {
      // contract: update patches only provided fields on existing entry
      const registry = seededRegistry([makeEntry({ artifacts: ['old.md'] })]);

      registry.update('sess-1', { artifacts: ['new.md'], state: 'work' });

      const stored = registry.lookup('sess-1');
      assert.strictEqual(stored?.state, 'work');
      assert.deepStrictEqual(stored?.artifacts, ['new.md']);
      assert.strictEqual(stored?.taskId, 'task-42');
    });

    it('should not throw and keep other entries intact for unknown sessionId', () => {
      // contract: update on missing key is a no-op, does not affect other entries
      const registry = seededRegistry([makeEntry({ sessionId: 'sess-1' })]);

      registry.update('no-such-session', { state: 'work' });

      const stored = registry.lookup('sess-1');
      assert.strictEqual(stored?.state, 'idle');
      assert.strictEqual(registry.all().length, 1);
    });
  });

  describe('#remove', () => {
    it('should delete registered entry from the store', () => {
      // contract: remove deletes entry; lookup after removal → undefined
      const registry = seededRegistry([makeEntry()]);

      registry.remove('sess-1');

      assert.strictEqual(registry.lookup('sess-1'), undefined);
      assert.strictEqual(registry.all().length, 0);
    });

    it('should not throw and keep other entries intact for unknown sessionId', () => {
      // contract: remove on missing key is a no-op, does not affect other entries
      const entry = makeEntry();
      const registry = seededRegistry([entry]);

      registry.remove('no-such-session');

      assert.deepStrictEqual(registry.lookup('sess-1'), entry);
      assert.strictEqual(registry.all().length, 1);
    });
  });

  describe('#findByTaskId', () => {
    it('should find entry by exact taskId match', () => {
      // contract: findByTaskId returns first matching entry by taskId
      const target = makeEntry({ sessionId: 'sess-target', taskId: 'target-task' });
      const registry = seededRegistry([
        makeEntry({ sessionId: 'sess-1', taskId: 'other-task' }),
        target,
        makeEntry({ sessionId: 'sess-2', taskId: 'target-task' }),
      ]);

      const result = registry.findByTaskId('target-task');

      assert.ok(result !== undefined);
      assert.strictEqual(result.sessionId, 'sess-target');
      assert.strictEqual(result.taskId, 'target-task');
    });

    it('should return undefined for unknown taskId', () => {
      // contract: no matching taskId → undefined
      const registry = seededRegistry([makeEntry({ taskId: 'task-1' })]);

      const result = registry.findByTaskId('nonexistent');

      assert.strictEqual(result, undefined);
    });
  });

  describe('#findByMr', () => {
    it('should return all entries for matching MR', () => {
      // contract: findByMr collects all entries with matching mr field
      const mr = 'https://gitlab.example.com/foo/bar/-/merge_requests/42';
      const entry1 = makeEntry({ sessionId: 'sess-a', mr });
      const entry2 = makeEntry({ sessionId: 'sess-b', mr, taskId: 'other-task' });
      const registry = seededRegistry([
        entry1,
        makeEntry({ sessionId: 'sess-c', mr: 'https://other.mr' }),
        entry2,
      ]);

      const result = registry.findByMr(mr);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result, [entry1, entry2]);
    });

    it('should return empty array for unknown MR', () => {
      // contract: no matching MR → empty array, not undefined
      const registry = seededRegistry([makeEntry()]);

      const result = registry.findByMr('https://unknown.mr');

      assert.deepStrictEqual(result, []);
    });
  });

  describe('#listByState', () => {
    it('should filter entries by idle state', () => {
      const registry = seededRegistry([
        makeEntry({ sessionId: 's-idle', state: 'idle' }),
        makeEntry({ sessionId: 's-work', state: 'work' }),
      ]);

      const result = registry.listByState('idle');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].sessionId, 's-idle');
    });

    it('should filter entries by work state', () => {
      const registry = seededRegistry([
        makeEntry({ sessionId: 's-idle', state: 'idle' }),
        makeEntry({ sessionId: 's-work', state: 'work' }),
      ]);

      const result = registry.listByState('work');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].sessionId, 's-work');
    });

    it('should filter entries by park state', () => {
      const registry = seededRegistry([
        makeEntry({ sessionId: 's-park1', state: 'park', parkedAt: '2026-08-06T10:00:00Z' }),
        makeEntry({ sessionId: 's-park2', state: 'park', parkedAt: '2026-08-06T11:00:00Z' }),
        makeEntry({ sessionId: 's-work', state: 'work' }),
      ]);

      const result = registry.listByState('park');

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].sessionId, 's-park1');
      assert.strictEqual(result[1].sessionId, 's-park2');
    });

    it('should filter entries by close state', () => {
      const registry = seededRegistry([
        makeEntry({ sessionId: 's-closed', state: 'close' }),
        makeEntry({ sessionId: 's-work', state: 'work' }),
      ]);

      const result = registry.listByState('close');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].sessionId, 's-closed');
    });

    it('should return empty array when no entries match given state', () => {
      // contract: empty registry or no matching state → empty array
      const registry = seededRegistry([makeEntry({ state: 'idle' })]);

      const result = registry.listByState('park');

      assert.deepStrictEqual(result, []);
    });
  });

  describe('#all', () => {
    it('should return all registered entries', () => {
      // contract: all returns a snapshot of all entries in insertion order
      const entry1 = makeEntry({ sessionId: 'sess-a' });
      const entry2 = makeEntry({ sessionId: 'sess-b' });
      const entry3 = makeEntry({ sessionId: 'sess-c' });
      const registry = seededRegistry([entry1, entry2, entry3]);

      const result = registry.all();

      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result, [entry1, entry2, entry3]);
    });

    it('should return empty array for empty registry', () => {
      // contract: empty registry → empty array, not undefined
      const registry = new SessionRegistry();

      const result = registry.all();

      assert.deepStrictEqual(result, []);
    });

    it('should not be affected by mutations after snapshot', () => {
      // contract: all returns a snapshot — mutating returned array does not affect internal store
      const entry = makeEntry();
      const registry = seededRegistry([entry]);

      const snapshot = registry.all();
      snapshot.pop();

      assert.strictEqual(registry.all().length, 1);
      assert.deepStrictEqual(registry.all(), [entry]);
    });
  });
});
