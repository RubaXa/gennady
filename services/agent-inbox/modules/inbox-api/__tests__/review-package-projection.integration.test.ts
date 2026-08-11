// @file: Integration tests — stale package remains visible with invalidation metadata; apply is rejected by CAS.
// @consumers: node:test runner
// @tasks: TSK-179

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { JournalProjectionAdapter } from '../projections/journal-projection.adapter.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { ReviewCommandRouter } from '../routers/commands/review-command.router.ts';
import type { ReviewFinding } from '../projections/review-mr.projection.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { TaskQueuePort } from '../../inbox-queue/task-queue.ts';
import type { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import type { JournalPort } from '../../inbox-core/event-journal.ts';

// ── registry stub ──

const EMPTY_REGISTRY = {
  load: () => ({ version: 1, entries: {} }),
} as unknown as InboxRegistryAccess;

// ── adapter subclass: stubs disk review to simulate revision bump ──

class StalePackageAdapter extends JournalProjectionAdapter {
  private readonly _diskRevision: number;
  constructor(
    deps: ConstructorParameters<typeof JournalProjectionAdapter>[0],
    diskRevision: number
  ) {
    super(deps);
    this._diskRevision = diskRevision;
  }
  protected override _readDiskReview(_mrRef: string): {
    findings: ReviewFinding[];
    verdict: string;
    revision: number;
  } | null {
    return { findings: [], verdict: '', revision: this._diskRevision };
  }
}

// ── HTTP helpers ──

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const bodyStr = body != null ? JSON.stringify(body) : '';
  const req = new Readable({ read() {} }) as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost' };
  if (body != null) {
    req.headers['content-type'] = 'application/json';
    process.nextTick(() => {
      req.push(Buffer.from(bodyStr));
      req.push(null);
    });
  } else {
    process.nextTick(() => req.push(null));
  }
  return req;
}

function mockRes(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let responseStatus = 0;
  let responseBody: unknown = null;
  const captured = {
    status: () => responseStatus,
    body: () => {
      if (typeof responseBody === 'string') {
        try {
          return JSON.parse(responseBody);
        } catch {
          return responseBody;
        }
      }
      return responseBody;
    },
  };
  const res = {
    writeHead: mock.fn((s: number) => {
      responseStatus = s;
      return res;
    }),
    end: mock.fn((c?: unknown) => {
      if (c != null) responseBody = c;
      return res;
    }),
    write: mock.fn(() => true),
    setHeader: mock.fn(() => res),
    getHeader: mock.fn(() => undefined),
    getHeaders: mock.fn(() => ({})),
  } as unknown as ServerResponse;
  return { res, ...captured };
}

// ── unified context ──

type PackageContext = {
  adapter: StalePackageAdapter;
  journal: EventJournal;
  commandRouter: ReviewCommandRouter;
  mrRef: string;
  packageId: string;
};

async function createPackageContext(): Promise<PackageContext> {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-pkg-'));
  const journal = new EventJournal(join(stateDir, 'events.jsonl'));
  const mrRef = 'group/project!99';
  const packageId = 'proposal-pkg-1';

  // Package created at revision 0; disk review.json will report revision 1 → package is stale
  await journal.append({
    ts: new Date().toISOString(),
    mr: mrRef,
    kind: 'proposal',
    actor: 'queue',
    payload: {
      proposalId: packageId,
      capability: 'post_findings',
      payload: { revision: 0 },
    },
  });
  // Decision for that proposal
  await journal.append({
    ts: new Date().toISOString(),
    mr: mrRef,
    kind: 'decision',
    actor: 'operator',
    payload: {
      proposalId: packageId,
      verdict: 'accept',
      taskId: '#1',
    },
  });

  // StalePackageAdapter: simulates disk revision = 1 (newer than package revision 0)
  const adapter = new StalePackageAdapter(
    { journal, registry: EMPTY_REGISTRY, stateDir },
    1 /* diskRevision */
  );

  const commandRouter = new ReviewCommandRouter({
    queue: {
      enqueue: mock.fn(() => ({ taskId: '#test', position: 0 })),
    } as unknown as TaskQueuePort,
    decisionJournal: { writeDecision: mock.fn(async () => 1) } as unknown as DecisionJournal,
    journal: { append: mock.fn(async () => 1) } as unknown as JournalPort,
    projections: adapter,
  });

  return { adapter, journal, commandRouter, mrRef, packageId };
}

// ── Test Graph ──
// Case A: stale package remains visible disabled and cannot apply

describe('ReviewPackageProjection integration', () => {
  it('stale package remains visible disabled and cannot apply', async () => {
    // invariant: stale package remains queryable with staleness reason; apply command rejects 409
    // failure mode: do not remove stale packages from the projection — UI shows them disabled

    const ctx = await createPackageContext();
    const { adapter, commandRouter, mrRef, packageId } = ctx;

    // #region START_STALE_VISIBLE_ASSERT
    const projection = adapter.packages(mrRef);
    assert.strictEqual(projection.current.length, 0, 'no current packages');
    assert.strictEqual(projection.stale.length, 1, 'one stale package');
    const staleItem = projection.stale[0];
    assert.strictEqual(staleItem.packageId, packageId);
    assert.strictEqual(staleItem.stale, true);
    assert.ok(staleItem.staleness != null, 'staleness metadata must be defined');
    assert.ok(
      typeof staleItem.staleness!.reason === 'string' && staleItem.staleness!.reason.length > 0
    );
    assert.strictEqual(staleItem.staleness!.atRevision, 1);
    // #endregion END_STALE_VISIBLE_ASSERT

    // #region START_STALE_APPLY_ASSERT_409
    const mrPath = `/api/v2/mr/${encodeURIComponent(mrRef)}/command`;
    const { res, status, body } = mockRes();
    await commandRouter.handle(
      mockReq('POST', mrPath, { kind: 'apply_package', packageId, revision: 0 }),
      res
    );
    assert.strictEqual(status(), 409, 'stale apply must be rejected with 409');
    const err = (body() as { error: { code: string } }).error;
    assert.strictEqual(err.code, 'conflict');
    // #endregion END_STALE_APPLY_ASSERT_409

    // outcomes are still readable (recorded before staleness)
    assert.strictEqual(staleItem.outcomes.length, 1);
    assert.strictEqual(staleItem.outcomes[0].verdict, 'accepted');
  });
});
