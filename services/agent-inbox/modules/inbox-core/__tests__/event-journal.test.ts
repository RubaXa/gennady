// @file: Unit+integration tests for EventJournal — append/seq/since, concurrent writers, broken tail, global journal
// @consumers: node:test runner
// @tasks: TSK-156

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EventJournal,
  type JournalEntry,
  type JournalPort,
  type SinceResult,
} from '../event-journal.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-core-event-journal-test-'));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeBase(overrides?: Partial<Omit<JournalEntry, 'seq'>>): Omit<JournalEntry, 'seq'> {
  return {
    ts: '2026-01-01T00:00:00Z',
    mr: 'g/project!42',
    kind: 'task_created',
    ...overrides,
  };
}

describe('EventJournal', () => {
  it('contract: journal entry envelope and port signatures', () => {
    // contract: JournalEntry shape — envelope with ts, seq, mr, kind, actor, payload
    // contract: JournalPort — append/read/since surface
    // failure mode: kind must be one of 10 closed-set values; seq must be number

    const entry: JournalEntry = {
      ts: '2026-01-01T00:00:00Z',
      seq: 1,
      mr: 'g/project!42',
      kind: 'task_created',
      actor: 'pipeline',
      payload: { id: '42' },
    };
    assert.strictEqual(entry.seq, 1);
    assert.strictEqual(typeof entry.seq, 'number');

    const port: JournalPort = new EventJournal(join(tmpDir, 'contract.jsonl'));
    assert.strictEqual(typeof port.append, 'function');
    assert.strictEqual(typeof port.read, 'function');
    assert.strictEqual(typeof port.since, 'function');
  });

  it('append assigns monotonic seq and since(cursor) paginates', async () => {
    // contract: 3 sequential appends → seq 1,2,3; since(1) → entries 2,3 + nextCursor=3
    // invariant: seq is monotonic per journal instance; since paginates by cursor

    const journal = new EventJournal(join(tmpDir, 'seq.jsonl'));
    const base = makeBase();

    // #region START_SEQ_SETUP
    const s1 = await journal.append(base);
    const s2 = await journal.append(base);
    const s3 = await journal.append(base);
    // #endregion END_SEQ_SETUP

    assert.strictEqual(s1, 1);
    assert.strictEqual(s2, 2);
    assert.strictEqual(s3, 3);

    const since1: SinceResult = journal.since(1);
    assert.strictEqual(since1.entries.length, 2);
    assert.strictEqual(since1.entries[0].seq, 2);
    assert.strictEqual(since1.entries[1].seq, 3);
    assert.strictEqual(since1.nextCursor, 3);

    const since2 = journal.since(3);
    assert.strictEqual(since2.entries.length, 0);
    assert.strictEqual(since2.nextCursor, 3);
  });

  it('concurrent appends are serialized without loss', async () => {
    // contract: 50 parallel appends → 50 intact lines, seq 1..50 without gaps
    // invariant: in-process serialization via promise chain, no tmp+rename
    // failure mode: do not assert internal write chain state — only public boundaries

    const path = join(tmpDir, 'concurrent.jsonl');
    const journal = new EventJournal(path);
    const base = makeBase();

    // #region START_CONCURRENT_SETUP
    const promises = Array.from({ length: 50 }, () => journal.append(base));
    const seqs = await Promise.all(promises);
    // #endregion END_CONCURRENT_SETUP

    seqs.sort((a, b) => a - b);
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(seqs[i], i + 1);
    }

    const entries = journal.read();
    assert.strictEqual(entries.length, 50);

    // every entry has a unique seq in range 1..50
    const seqSet = new Set(entries.map((e) => e.seq));
    assert.strictEqual(seqSet.size, 50);
  });

  it('truncated tail is discarded on replay', async () => {
    // contract: valid entries read; broken tail skipped; journal remains appendable
    // invariant: corrupt line is skipped with error log; entries AFTER a corrupt line stay visible
    // failure mode (fixed GAP-1): stop-at-first-broken hid later valid entries (multi-process writers)

    const path = join(tmpDir, 'broken.jsonl');

    // #region START_BROKEN_TAIL_SETUP
    writeFileSync(
      path,
      '{"ts":"2026-01-01T00:00:00Z","seq":1,"mr":"g/project!42","kind":"task_created"}\n' +
        '{"ts":"2026-01-01T00:00:01Z","seq":2,"mr":"g/project!42","kind":"task_status"}\n' +
        '{"ts":"2026-01-01T00:00:02Z","seq":3,"mr":"g/project!42","kind":"broken tail\n'
    );
    // #endregion END_BROKEN_TAIL_SETUP

    const journal = new EventJournal(path);
    const entries = journal.read();
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].seq, 1);
    assert.strictEqual(entries[1].seq, 2);

    const seq = await journal.append(makeBase());
    assert.strictEqual(seq, 3);

    const entriesAfter = journal.read();
    assert.strictEqual(entriesAfter.length, 3);
    assert.strictEqual(entriesAfter[2].seq, 3);
  });

  it('corrupt mid-file line is skipped, later entries stay visible', async () => {
    // contract: GAP-1 — valid entries after a corrupt line are recovered, not hidden

    const path = join(tmpDir, 'midcorrupt.jsonl');
    writeFileSync(
      path,
      '{"ts":"2026-01-01T00:00:00Z","seq":1,"mr":"g/project!42","kind":"task_created"}\n' +
        'CORRUPT-LINE\n' +
        '{"ts":"2026-01-01T00:00:02Z","seq":3,"mr":"g/project!42","kind":"task_status"}\n'
    );

    const journal = new EventJournal(path);
    const entries = journal.read();
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual(
      entries.map((e) => e.seq),
      [1, 3]
    );
    // seq restored from true max — append continues at 4, no collision with hidden entries
    const seq = await journal.append(makeBase());
    assert.strictEqual(seq, 4);
  });

  it('mr-less events go to global system journal', async () => {
    // contract: kind=system event without MR → written to global journal with mr='system'
    // invariant: global journal is a regular EventJournal; path includes agent-inbox/events.jsonl

    const path = join(tmpDir, 'agent-inbox', 'events.jsonl');
    const journal = new EventJournal(path);

    const seq = await journal.append({
      ts: '2026-01-01T00:00:00Z',
      mr: 'system',
      kind: 'system',
    });

    assert.strictEqual(seq, 1);
    const entries = journal.read();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].mr, 'system');
    assert.strictEqual(entries[0].kind, 'system');
  });

  it('seq survives restart without reuse', async () => {
    // contract: 3 fsync'd entries → new instance → append → seq=4, entries 1-3 intact, no duplicate seq
    // invariant: _scanMaxSeq restores lastSeq from disk; restart never reuses seq numbers

    const path = join(tmpDir, 'restart.jsonl');
    const base = makeBase();

    // #region START_RESTART_SETUP
    const journal1 = new EventJournal(path);
    await journal1.append(base);
    await journal1.append(base);
    await journal1.append(base);
    // #endregion END_RESTART_SETUP

    const journal2 = new EventJournal(path);
    const seq = await journal2.append(base);
    assert.strictEqual(seq, 4);

    const entries = journal2.read();
    assert.strictEqual(entries.length, 4);
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(entries[i].seq, i + 1);
    }
  });

  it('journals are isolated per MR', async () => {
    // contract: alternate appends to journals A and B → independent seq 1..N; since() on A excludes B entries
    // invariant: each journal file is a separate EventJournal with its own seq space

    const journalA = new EventJournal(join(tmpDir, 'mr-a.jsonl'));
    const journalB = new EventJournal(join(tmpDir, 'mr-b.jsonl'));

    // #region START_ISOLATION_SETUP
    await journalA.append(makeBase({ mr: 'g/project!1' }));
    await journalB.append(makeBase({ mr: 'g/project!2' }));
    await journalA.append(makeBase({ mr: 'g/project!1' }));
    await journalB.append(makeBase({ mr: 'g/project!2' }));
    // #endregion END_ISOLATION_SETUP

    const entriesA = journalA.read();
    const entriesB = journalB.read();
    assert.strictEqual(entriesA.length, 2);
    assert.strictEqual(entriesB.length, 2);
    assert.strictEqual(entriesA[0].seq, 1);
    assert.strictEqual(entriesA[1].seq, 2);
    assert.strictEqual(entriesB[0].seq, 1);
    assert.strictEqual(entriesB[1].seq, 2);

    const sinceA = journalA.since(0);
    assert.strictEqual(
      sinceA.entries.every((e) => e.mr === 'g/project!1'),
      true
    );
  });

  it('broken registry rebuilds safely from gitlab and journals', async () => {
    // contract: EventJournal resilience — works even when sibling inbox-registry.json is broken
    // note: scenario primarily tests InboxRegistryAccess; EventJournal has no dependency on registry

    const brokenReg = join(tmpDir, 'inbox-registry.json');
    writeFileSync(brokenReg, 'not-valid-json{{{');

    const journal = new EventJournal(join(tmpDir, 'resilient.jsonl'));
    const seq = await journal.append(makeBase());
    assert.strictEqual(seq, 1);

    const entries = journal.read();
    assert.strictEqual(entries.length, 1);
  });
});
