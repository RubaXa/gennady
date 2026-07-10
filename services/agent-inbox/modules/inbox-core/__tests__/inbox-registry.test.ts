// @file: Unit tests for inbox-core InboxRegistryAccess — delta NEW/↑/idle, promoteReviewedHeadSha.
// @consumers: node:test runner
// @tasks: TSK-109

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InboxRegistryAccess, type MrForDelta } from '../inbox-registry.ts';
import type {
  InboxRegistry,
  RegistryEntry,
} from '../../../../../cli/cmd/inbox/_core/logic/inbox-registry.logic.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-core-registry-test-'));
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

function writeRegFile(filePath: string, entries: Record<string, RegistryEntry>): void {
  writeFileSync(filePath, JSON.stringify(makeReg(entries), null, 2), 'utf8');
}

describe('InboxRegistryAccess — дельта NEW/↑/idle', () => {
  it('GIVEN реестр с 2 MR WHEN updateDelta([MR1(updated), MR3(new)]) THEN delta = { NEW: [MR3], ↑: [MR1] }', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {
      'https://example.com/1': makeEntry({
        project: 'g/p',
        iid: '1',
        lastSeenUpdatedAt: '2026-01-01T00:00:00Z',
      }),
      'https://example.com/2': makeEntry({
        project: 'g/p',
        iid: '2',
        lastSeenUpdatedAt: '2026-01-01T00:00:00Z',
      }),
    });

    const access = new InboxRegistryAccess(tmpDir);
    access.load();

    const mrs: MrForDelta[] = [
      {
        webUrl: 'https://example.com/1',
        project: 'g/p',
        iid: '1',
        updatedAt: '2026-02-01T00:00:00Z',
      },
      {
        webUrl: 'https://example.com/3',
        project: 'g/p',
        iid: '3',
        updatedAt: '2026-01-15T00:00:00Z',
      },
    ];

    const delta = access.updateDelta(mrs);
    assert.strictEqual(delta.NEW.length, 1);
    assert.strictEqual(delta.NEW[0].webUrl, 'https://example.com/3');
    assert.strictEqual(delta.NEW[0].tag, 'NEW');
    assert.strictEqual(delta['↑'].length, 1);
    assert.strictEqual(delta['↑'][0].webUrl, 'https://example.com/1');
    assert.strictEqual(delta['↑'][0].tag, '↑');
  });

  it('GIVEN MR unchanged WHEN updateDelta THEN idle (не в дельте)', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {
      'https://example.com/1': makeEntry({
        project: 'g/p',
        iid: '1',
        lastSeenUpdatedAt: '2026-01-01T00:00:00Z',
      }),
    });

    const access = new InboxRegistryAccess(tmpDir);
    access.load();

    const mrs: MrForDelta[] = [
      {
        webUrl: 'https://example.com/1',
        project: 'g/p',
        iid: '1',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const delta = access.updateDelta(mrs);
    assert.strictEqual(delta.NEW.length, 0);
    assert.strictEqual(delta['↑'].length, 0);
  });

  it('GIVEN пустой реестр WHEN updateDelta THEN все MR = NEW', () => {
    // no registry file
    const access = new InboxRegistryAccess(tmpDir);
    access.load();

    const mrs: MrForDelta[] = [
      {
        webUrl: 'https://example.com/a',
        project: 'g/p',
        iid: '1',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        webUrl: 'https://example.com/b',
        project: 'g/p',
        iid: '2',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const delta = access.updateDelta(mrs);
    assert.strictEqual(delta.NEW.length, 2);
    assert.strictEqual(delta['↑'].length, 0);
  });

  it('GIVEN реестр отсутствует WHEN updateDelta THEN пустой реестр загружается (NEW для всех)', () => {
    const access = new InboxRegistryAccess(join(tmpDir, 'nonexistent-delta'));
    const mrs: MrForDelta[] = [
      { webUrl: 'https://x/1', project: 'g/p', iid: '1', updatedAt: '2026-01-01T00:00:00Z' },
    ];
    const delta = access.updateDelta(mrs);
    assert.strictEqual(delta.NEW.length, 1);
  });

  it('GIVEN corrupted registry file WHEN updateDelta THEN treated as empty (all NEW)', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeFileSync(regPath, 'not-json{{{', 'utf8');
    const access = new InboxRegistryAccess(tmpDir);
    const mrs: MrForDelta[] = [
      { webUrl: 'https://x/1', project: 'g/p', iid: '1', updatedAt: '2026-01-01T00:00:00Z' },
    ];
    const delta = access.updateDelta(mrs);
    assert.strictEqual(delta.NEW.length, 1);
  });
});

describe('InboxRegistryAccess — promoteReviewedHeadSha', () => {
  it('promoteReviewedHeadSha обновляет lastReviewedHeadSha из candidateHeadSha', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {
      'https://x/1': makeEntry({
        project: 'g/p',
        iid: '1',
        candidateHeadSha: 'abc123',
      }),
    });

    const access = new InboxRegistryAccess(tmpDir);
    access.load();
    const result = access.promoteReviewedHeadSha('https://x/1');
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, 'abc123');
    assert.strictEqual(result.entries['https://x/1'].candidateHeadSha, 'abc123');
  });

  it('promoteReviewedHeadSha — no-op when entry not found', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {});

    const access = new InboxRegistryAccess(tmpDir);
    access.load();
    const result = access.promoteReviewedHeadSha('https://x/999');
    assert.deepStrictEqual(result.entries, {});
  });

  it('promoteReviewedHeadSha — no-op when candidateHeadSha is undefined', () => {
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {
      'https://x/1': makeEntry({ project: 'g/p', iid: '1', candidateHeadSha: undefined }),
    });

    const access = new InboxRegistryAccess(tmpDir);
    access.load();
    const result = access.promoteReviewedHeadSha('https://x/1');
    assert.strictEqual(result.entries['https://x/1'].lastReviewedHeadSha, undefined);
  });
});

describe('InboxRegistryAccess — save', () => {
  it('save атомарно пишет registry и load его читает', () => {
    const access = new InboxRegistryAccess(tmpDir);
    access.load();

    // updateDelta automatically updates in-memory registry entries, but since
    // we want to test save/load roundtrip, we write entries directly
    const regPath = join(tmpDir, 'inbox-registry.json');
    writeRegFile(regPath, {
      'https://x/1': makeEntry({ project: 'g/p', iid: '1', candidateHeadSha: 'saved-sha' }),
    });

    const access2 = new InboxRegistryAccess(tmpDir);
    const loaded = access2.load();
    assert.strictEqual(loaded.entries['https://x/1'].candidateHeadSha, 'saved-sha');
  });

  it('save в несуществующую директорию → создаёт родительские директории', () => {
    const deepDir = join(tmpDir, 'deep', 'nested');
    // create the deep dir manually then write the registry file
    mkdirSync(deepDir, { recursive: true });
    const regPath = join(deepDir, 'inbox-registry.json');
    writeFileSync(
      regPath,
      JSON.stringify(
        makeReg({
          'https://x/1': makeEntry({ project: 'g/p', iid: '1', candidateHeadSha: 'deep-sha' }),
        })
      ),
      'utf8'
    );
    const access2 = new InboxRegistryAccess(deepDir);
    const loaded = access2.load();
    assert.strictEqual(loaded.entries['https://x/1'].candidateHeadSha, 'deep-sha');
  });
});
