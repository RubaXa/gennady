// @file: Foundation runtime integration — shared boot state and MR-scoped decision persistence.
// @consumers: node:test runner
// @tasks: TSK-157

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { HttpServer } from '../http-server.ts';
import { BoardProviderMock } from '../board-provider.mock.ts';
import { BootReadiness } from '../../inbox-core/boot-readiness.ts';
import { EventJournal } from '../../inbox-core/event-journal.ts';
import { DecisionJournal } from '../../inbox-core/decision-journal.ts';
import { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import { InMemoryTaskQueue } from '../../inbox-queue/task-queue.ts';
import { TaskRegistry } from '../../inbox-queue/task-registry.ts';
import { bootstrap } from '../../../serve/bootstrap.ts';
import { emitDryRun } from '../../inbox-core/dry-run.ts';
import { mrKey } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function requestJson(
  port: number,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const encoded = body ? JSON.stringify(body) : undefined;
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: encoded
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>,
          })
        );
      }
    );
    req.on('error', reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

describe('TSK-157 foundation runtime backing', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'gennady-foundation-'));
  const readiness = new BootReadiness();
  const journals = new Map<string, DecisionJournal>();
  let server: HttpServer;
  let port: number;

  before(async () => {
    readiness.setConfigStatus(true);
    readiness.transition('poll');
    readiness.transition('reconcile');
    readiness.transition('restore');
    readiness.transition('ready');
    const queue = new InMemoryTaskQueue(new TaskRegistry());
    const resolve = (mr: string): DecisionJournal => {
      let journal = journals.get(mr);
      if (!journal) {
        journal = new DecisionJournal(
          new EventJournal(join(stateDir, `${mr.replaceAll('/', '_')}.jsonl`))
        );
        journals.set(mr, journal);
      }
      return journal;
    };
    server = new HttpServer({
      port: 0,
      boardProvider: new BoardProviderMock(),
      bootReadiness: readiness,
      inboxApi: {
        queue,
        decisionJournal: resolve('fallback!0'),
        resolveDecisionJournal: resolve,
        journal: new EventJournal(join(stateDir, 'events.jsonl')),
        registry: new InboxRegistryAccess(stateDir),
      },
    });
    await server.start();
    port = server.listeningPort() ?? assert.fail('expected bound port');
  });

  after(async () => server.stop());

  it('serves the shared ready/config snapshot from production HttpServer', async () => {
    const result = await requestJson(port, '/api/boot');
    assert.equal(result.status, 200);
    assert.equal(result.body.phase, 'ready');
    assert.equal(result.body.ready, true);
    assert.equal(result.body.configured, true);
  });

  it('persists proposal and decision into the actual MR journal', async () => {
    const mr = 'group/project!157';
    const result = await requestJson(port, `/api/mr/${encodeURIComponent(mr)}/decision`, 'POST', {
      proposalId: 'proposal-157',
      verdict: 'reject',
      proposal: {
        capability: 'react',
        payload: { emoji: '👍' },
        producedBy: { sessionId: 'pipeline-157' },
      },
    });
    assert.equal(result.status, 204);
    const entries = journals.get(mr)!.computeAcceptRate('react');
    assert.equal(entries.acceptCount, 0);
    assert.equal(entries.totalDecisions, 1);
  });
});

describe('TSK-157 public bootstrap lifecycle', () => {
  it('serves real /api/boot snapshots before and through every bootstrap phase', async () => {
    const port = await reservePort();
    const observed: Array<{ status: number; body: Record<string, unknown> }> = [];
    const result = await bootstrap({
      mocks: true,
      port,
      stateDir: mkdtempSync(join(tmpdir(), 'gennady-public-boot-')),
      onBootState: async () => {
        observed.push(await requestJson(port, '/api/boot'));
      },
    });
    try {
      const phases = observed.map((snapshot) => snapshot.body.phase);
      assert.deepEqual(phases, ['connect', 'poll', 'reconcile', 'restore', 'ready']);
      assert.ok(observed.every((snapshot) => snapshot.status === 200));
      assert.equal(observed.at(-1)?.body.ready, true);
    } finally {
      await result.server.stop();
    }
  });

  it('persists MR-scoped dry-run before its live broadcaster can observe it', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'gennady-dryrun-'));
    const result = await bootstrap({ mocks: true, port: 0, stateDir, dryRun: true });
    try {
      const mr = 'group/project!157';
      await emitDryRun('mr', 'post→MR group/project!157: proof', mr);
      const path = join(stateDir, 'agent-inbox', 'mrs', mrKey(mr), 'events.jsonl');
      const entries = readFileSync(path, 'utf8');
      assert.match(entries, /"mr":"group\/project!157"/);
      assert.match(entries, /"event":"dryrun"/);
    } finally {
      await result.server.stop();
    }
  });
});
