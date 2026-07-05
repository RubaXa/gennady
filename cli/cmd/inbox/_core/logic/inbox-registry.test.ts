// @file: Unit tests for inbox registry — candidateHeadSha, lastReviewedHeadSha, promoteReviewedHead.
// @consumers: node:test runner
// @tasks: TSK-94

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRegistry,
  saveRegistry,
  promoteReviewedHead,
  resetInboxState,
  type InboxRegistry,
  type RegistryEntry,
} from './inbox-registry.logic.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-registry-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(over?: Partial<RegistryEntry>): RegistryEntry {
  return {
    project: 'g/p',
    iid: '1',
    role: 'reviewer',
    stage: 'idle',
    lastSeenUpdatedAt: '2026-01-01T00:00:00Z',
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastClassifiedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeReg(entries: Record<string, RegistryEntry>): InboxRegistry {
  return { version: 1, entries };
}

describe('loadRegistry / saveRegistry with SHA fields', () => {
  it('saves and loads candidateHeadSha and lastReviewedHeadSha roundtrip', () => {
    const path = join(tmpDir, 'with-sha.json');
    const registry = makeReg({
      'https://example.com/1': makeEntry({
        candidateHeadSha: 'abc123def',
        lastReviewedHeadSha: 'def456abc',
      }),
    });
    saveRegistry(path, registry);
    const loaded = loadRegistry(path);
    assert.strictEqual(loaded.entries['https://example.com/1'].candidateHeadSha, 'abc123def');
    assert.strictEqual(loaded.entries['https://example.com/1'].lastReviewedHeadSha, 'def456abc');
  });

  it('loads entries without sha fields (backward compat — fields absent)', () => {
    const path = join(tmpDir, 'without-sha.json');
    const registry = makeReg({
      'https://example.com/1': makeEntry(),
    });
    saveRegistry(path, registry);
    const loaded = loadRegistry(path);
    assert.strictEqual(loaded.entries['https://example.com/1'].candidateHeadSha, undefined);
    assert.strictEqual(loaded.entries['https://example.com/1'].lastReviewedHeadSha, undefined);
  });

  it('loadRegistry returns empty registry on missing file', () => {
    const result = loadRegistry(join(tmpDir, 'nonexistent.json'));
    assert.deepStrictEqual(result, { version: 1, entries: {} });
  });

  it('loadRegistry returns empty on corrupt JSON', () => {
    const path = join(tmpDir, 'corrupt.json');
    writeFileSync(path, 'not-json{{{', 'utf8');
    const result = loadRegistry(path);
    assert.deepStrictEqual(result, { version: 1, entries: {} });
  });

  it('saveRegistry creates parent directories', () => {
    const deep = join(tmpDir, 'deep', 'nested', 'reg.json');
    saveRegistry(deep, makeReg({ 'https://x/1': makeEntry({ candidateHeadSha: 'sha' }) }));
    const loaded = loadRegistry(deep);
    assert.strictEqual(loaded.entries['https://x/1'].candidateHeadSha, 'sha');
  });
});

describe('promoteReviewedHead', () => {
  it('promotes candidateHeadSha → lastReviewedHeadSha on exact match', () => {
    const reg = makeReg({
      'https://x/1': makeEntry({ candidateHeadSha: 'abc123' }),
    });
    const result = promoteReviewedHead(reg, 'g/p!1');
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, 'abc123');
    assert.strictEqual(result.entries['https://x/1'].candidateHeadSha, 'abc123');
  });

  it('returns original registry (same ref) when entry not found', () => {
    const reg = makeReg({});
    const result = promoteReviewedHead(reg, 'g/p!999');
    assert.strictEqual(result, reg);
  });

  it('no-op when candidateHeadSha is undefined', () => {
    const reg = makeReg({
      'https://x/1': makeEntry({ candidateHeadSha: undefined }),
    });
    const result = promoteReviewedHead(reg, 'g/p!1');
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, undefined);
  });

  it('no-op when candidateHeadSha is empty string', () => {
    const reg = makeReg({
      'https://x/1': makeEntry({ candidateHeadSha: '' }),
    });
    const result = promoteReviewedHead(reg, 'g/p!1');
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, undefined);
  });

  it('finds correct entry by project+iid when multiple entries exist', () => {
    const reg = makeReg({
      'https://x/a': makeEntry({ project: 'g/a', iid: '1', candidateHeadSha: 'sha-a' }),
      'https://x/b': makeEntry({ project: 'g/b', iid: '2', candidateHeadSha: 'sha-b' }),
    });
    const result = promoteReviewedHead(reg, 'g/b!2');
    assert.strictEqual(result.entries['https://x/b'].lastReviewedHeadSha, 'sha-b');
    assert.strictEqual(result.entries['https://x/a'].lastReviewedHeadSha, undefined);
  });

  it('no-op on invalid ref format (no exclamation mark)', () => {
    const reg = makeReg({
      'https://x/1': makeEntry({ candidateHeadSha: 'abc' }),
    });
    const result = promoteReviewedHead(reg, 'invalid-ref-without-bang');
    assert.strictEqual(result, reg);
  });

  it('returns shallow copy — original registry unchanged', () => {
    const original = makeReg({
      'https://x/1': makeEntry({ candidateHeadSha: 'original-sha' }),
    });
    const result = promoteReviewedHead(original, 'g/p!1');
    assert.notStrictEqual(result, original);
    assert.notStrictEqual(result.entries, original.entries);
    assert.strictEqual(original.entries['https://x/1'].lastReviewedHeadSha, undefined);
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, 'original-sha');
  });

  it('preserves unrelated entry properties on promotion', () => {
    const reg = makeReg({
      'https://x/1': makeEntry({
        candidateHeadSha: 'new-sha',
        role: 'author',
        stage: 'review_needed',
        firstSeenAt: '2026-01-01T00:00:00Z',
      }),
    });
    const result = promoteReviewedHead(reg, 'g/p!1');
    const entry = result.entries['https://x/1'];
    assert.strictEqual(entry.lastReviewedHeadSha, 'new-sha');
    assert.strictEqual(entry.role, 'author');
    assert.strictEqual(entry.stage, 'review_needed');
    assert.strictEqual(entry.firstSeenAt, '2026-01-01T00:00:00Z');
  });
});
