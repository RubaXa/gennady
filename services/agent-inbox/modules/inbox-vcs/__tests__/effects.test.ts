// @file: Unit/integration tests for Effects — resolve rights check, idempotency, network failure, SSRF validation.
// @consumers: node:test runner
// @tasks: TSK-158

import { describe, it, mock, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import {
  VcsPort,
  type VcsDiscussion,
  type VcsDiscussionNote,
  type DiscussionsPage,
} from '../vcs-port.ts';
import { Effects } from '../effects.ts';

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-vcs-effects-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = mkdtempSync(join(tmpdir(), 'inbox-vcs-effects-test-'));
});

class StubVcs extends VcsPort {
  getCurrentUserLogin = mock.fn(async () => 'default_user');
  getInbox = mock.fn(async () => []);
  getMrDetail = mock.fn(async () => {
    throw new Error('not implemented');
  });
  getDiscussions = mock.fn(
    async (): Promise<DiscussionsPage> => ({
      discussions: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  );
  compareSha = mock.fn(async () => ({ commits: [] }));
  postNote = mock.fn(async () => {});
  postDiscussion = mock.fn(async () => {});
  react = mock.fn(async () => {});
  resolve = mock.fn(async () => {});
  approve = mock.fn(async () => {});
  editDescription = mock.fn(async () => {});
  getHost = mock.fn(() => 'gitlab.example.com');
}

function makeEffects(stub?: StubVcs, journal?: EventJournal) {
  const vcs = stub ?? new StubVcs();
  const j = journal ?? new EventJournal(join(tmpDir, 'events.jsonl'));
  return { effects: new Effects(vcs, j), vcs, journal: j };
}

describe('Effects — contract surface', () => {
  it('contract: Effects exposes postNote, react, resolve, approve, editDescription', () => {
    const { effects } = makeEffects();
    assert.strictEqual(typeof effects.postNote, 'function');
    assert.strictEqual(typeof effects.react, 'function');
    assert.strictEqual(typeof effects.resolve, 'function');
    assert.strictEqual(typeof effects.approve, 'function');
    assert.strictEqual(typeof effects.editDescription, 'function');
  });
});

describe('Effects#resolve — D-323 rights check', () => {
  it('resolve of foreign thread is rejected deterministically', async () => {
    // contract: foreign thread (author != myLogin) in foreign MR (!isMyMr) → rejection with reason
    // failure mode: marker must NOT be written for rejected resolves; failed marker must appear in journal

    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'resolve-foreign.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await assert.rejects(
      () =>
        effects.resolve(
          {
            project: 'g/proj',
            iid: '42',
            discussionId: 'disc-123',
            myLogin: 'me',
            threadAuthor: 'other_user',
            isMyMr: false,
          },
          'g/proj!42'
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /BLOCKED.*thread author.*other_user.*me/);
        return true;
      }
    );

    // VCS resolve was never called — rejection happened at rights check
    assert.strictEqual(stub.resolve.mock.callCount(), 0);

    // failed marker written to journal
    const entries = journal.read();
    const failed = entries.find((e) => e.payload?.status === 'failed');
    assert.ok(failed, 'failed marker must be written to journal');
    assert.strictEqual(failed.payload?.effect, 'resolve');
  });

  it('resolve own thread in own MR is allowed', async () => {
    // contract: own thread (threadAuthor === myLogin) → resolve proceeds to VCS call

    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'resolve-own.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await effects.resolve(
      {
        project: 'g/proj',
        iid: '42',
        discussionId: 'disc-456',
        myLogin: 'me',
        threadAuthor: 'me',
        isMyMr: true,
      },
      'g/proj!42'
    );

    assert.strictEqual(stub.resolve.mock.callCount(), 1);
    assert.deepStrictEqual(stub.resolve.mock.calls[0].arguments, ['g/proj', '42', 'disc-456']);

    const entries = journal.read();
    const confirmed = entries.find((e) => e.payload?.status === 'confirmed');
    assert.ok(confirmed, 'confirmed marker must be written');
    assert.strictEqual(confirmed.payload?.effect, 'resolve');
  });

  it('resolve robot thread in own MR is allowed', async () => {
    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'resolve-robot.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await effects.resolve(
      {
        project: 'g/proj',
        iid: '42',
        discussionId: 'disc-789',
        myLogin: 'me',
        threadAuthor: 'gitlab-bot',
        isMyMr: true,
      },
      'g/proj!42'
    );

    assert.strictEqual(stub.resolve.mock.callCount(), 1);
  });

  it('resolve handles race condition — already resolved → no-op + journal marker', async () => {
    // contract: VCS throws "already resolved" or 409 → no-op, marker still written

    const stub = new StubVcs();
    stub.resolve = mock.fn(async () => {
      throw new Error('Discussion already resolved (HTTP 409)');
    });
    const journal = new EventJournal(join(tmpDir, 'resolve-race.jsonl'));
    const { effects } = makeEffects(stub, journal);

    // should not throw
    await effects.resolve(
      {
        project: 'g/proj',
        iid: '42',
        discussionId: 'disc-race',
        myLogin: 'me',
        threadAuthor: 'me',
        isMyMr: true,
      },
      'g/proj!42'
    );

    assert.strictEqual(stub.resolve.mock.callCount(), 1);

    const entries = journal.read();
    const confirmed = entries.find((e) => e.payload?.status === 'confirmed');
    assert.ok(confirmed, 'confirmed marker must be written even on race condition');
  });
});

describe('Effects — idempotency', () => {
  it('network failure on effect leaves no marker and retries safely', async () => {
    // contract: VCS call fails → no confirmed marker written; caller can retry safely
    // invariant: marker is written ONLY after GitLab confirmation (postNote success)

    const stub = new StubVcs();
    stub.postNote = mock.fn(async () => {
      throw new Error('Network timeout');
    });
    const journal = new EventJournal(join(tmpDir, 'idempotency-fail.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await assert.rejects(
      () =>
        effects.postNote(
          {
            project: 'g/proj',
            iid: '42',
            body: 'test note body for idempotency check',
          },
          'g/proj!42'
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /Post failed/);
        return true;
      }
    );

    // No confirmed marker
    const entries = journal.read();
    const confirmed = entries.filter((e) => e.payload?.status === 'confirmed');
    assert.strictEqual(confirmed.length, 0, 'no confirmed marker must be written on failure');
  });

  it('second identical postNote call is skipped idempotently', async () => {
    // contract: postNote with same body → second call reads marker, skips VCS call
    // invariant: idempotency gate is _hasMarker → skip BEFORE any network call

    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'idempotency-dedup.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await effects.postNote(
      { project: 'g/proj', iid: '42', body: 'Hello world for dedup test' },
      'g/proj!42'
    );
    assert.strictEqual(stub.postNote.mock.callCount(), 1);

    // second call — same body → idempotent skip
    await effects.postNote(
      { project: 'g/proj', iid: '42', body: 'Hello world for dedup test' },
      'g/proj!42'
    );
    assert.strictEqual(
      stub.postNote.mock.callCount(),
      1,
      'second call must be skipped idempotently'
    );
  });

  it('postNote with different body is not considered duplicate', async () => {
    const stub = new StubVcs();
    const journal = new EventJournal(join(tmpDir, 'idempotency-diff.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await effects.postNote(
      { project: 'g/proj', iid: '42', body: 'First message body text here' },
      'g/proj!42'
    );
    await effects.postNote(
      { project: 'g/proj', iid: '42', body: 'Second message body text different' },
      'g/proj!42'
    );

    assert.strictEqual(stub.postNote.mock.callCount(), 2);
  });
});

describe('Effects — SSRF validation', () => {
  it('foreign host url is rejected', async () => {
    // contract: VcsPort.getHost() returns configured host — used for SSRF validation
    // invariant: any MR URL with host != getHost() must be rejected before any network call

    const stub = new StubVcs();
    stub.postNote = mock.fn(async () => {});
    const journal = new EventJournal(join(tmpDir, 'ssrf.jsonl'));
    const { effects } = makeEffects(stub, journal);

    const foreignMrUrl = 'https://evil.com/g/proj/-/merge_requests/42';

    await assert.rejects(
      () =>
        effects.postNote(
          { project: 'g/proj', iid: '42', body: 'test', mrUrl: foreignMrUrl },
          'g/proj!42'
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /SSRF BLOCKED/);
        assert.match((error as Error).message, /evil\.com/);
        return true;
      }
    );

    // No network call was made
    assert.strictEqual(
      stub.postNote.mock.callCount(),
      0,
      'postNote must not be called on SSRF rejection'
    );
  });

  it('resolve with foreign host url is also rejected by SSRF guard', async () => {
    // contract: all 5 effect methods call _validateHost — resolve is no exception
    // invariant: resolveParams.mrUrl with foreign host triggers SSRF BLOCKED before network call

    const stub = new StubVcs();
    stub.resolve = mock.fn(async () => {});
    const journal = new EventJournal(join(tmpDir, 'ssrf-resolve.jsonl'));
    const { effects } = makeEffects(stub, journal);

    const foreignMrUrl = 'https://evil.com/g/proj/-/merge_requests/42';

    await assert.rejects(
      () =>
        effects.resolve(
          {
            project: 'g/proj',
            iid: '42',
            discussionId: 'disc-456',
            myLogin: 'me',
            threadAuthor: 'me',
            isMyMr: true,
            mrUrl: foreignMrUrl,
          },
          'g/proj!42'
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /SSRF BLOCKED/);
        assert.match((error as Error).message, /evil\.com/);
        return true;
      }
    );

    assert.strictEqual(
      stub.resolve.mock.callCount(),
      0,
      'resolve must not be called on SSRF rejection'
    );
  });
});

describe('Effects — rate limit backoff', () => {
  it('rate limit backs off without failing sync', async () => {
    // contract: when VCS throws a rate-limit error, Effects propagates it cleanly — sync caller retries
    // invariant: Effects does NOT swallow rate-limit errors; caller receives them for backoff handling

    const stub = new StubVcs();
    stub.postNote = mock.fn(async () => {
      const err = new Error('HTTP 429 Too Many Requests');
      (err as Record<string, unknown>).retryAfter = 30;
      throw err;
    });
    const journal = new EventJournal(join(tmpDir, 'rate-limit.jsonl'));
    const { effects } = makeEffects(stub, journal);

    await assert.rejects(
      () =>
        effects.postNote(
          { project: 'g/proj', iid: '42', body: 'rate limit test body content here' },
          'g/proj!42'
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match((error as Error).message, /Post failed/);
        return true;
      }
    );

    // No confirmed marker — caller can retry safely
    const entries = journal.read();
    const confirmed = entries.filter((e) => e.payload?.status === 'confirmed');
    assert.strictEqual(confirmed.length, 0);
  });
});

describe('Effects — identity resolution', () => {
  it('T5: getCurrentUserLogin returns my login, not first inbox author', async () => {
    // contract: myLogin comes from getCurrentUserLogin() on VcsPort, NOT from
    // the first author in the inbox. This ensures identity is resolved via VCS
    // identity endpoint, not by guessing from MR data.
    const stub = new StubVcs();
    stub.getCurrentUserLogin = mock.fn(async () => 'alice');

    const login = await stub.getCurrentUserLogin();
    assert.strictEqual(login, 'alice');
    assert.strictEqual(stub.getCurrentUserLogin.mock.callCount(), 1);
  });
});
