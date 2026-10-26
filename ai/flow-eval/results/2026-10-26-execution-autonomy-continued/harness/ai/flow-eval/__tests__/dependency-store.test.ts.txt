// @file: Retention contract for flow-eval's lock-verified shared dependency metadata stores.
// @spec: AI-SKILLS
// @consumers: dependency-store.ts

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EVAL_ALLOWED_DEPENDENCIES,
  gcEvalDependencyStores,
  prepareEvalDependencyStore,
  releaseEvalDependencyLease,
  startEvalDependencyLeaseHeartbeat,
  type EvalDependencyLeaseRuntime,
} from '../dependency-store.ts';
import { SDD_EVAL_RETENTION_POLICY } from '../retention-policy.ts';

const roots = new Set<string>();
const DAY_MS = 24 * 60 * 60 * 1000;

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'eval-dependency-store-'));
  roots.add(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

type LeaseFixture = {
  readonly heartbeatAt: Date;
  readonly pid?: number;
  readonly hostname?: string;
  readonly corrupted?: boolean;
  readonly legacy?: boolean;
};

function store(root: string, name: string, modified: Date, lease?: LeaseFixture): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  const metadata = join(directory, 'metadata.json');
  writeFileSync(metadata, '{}\n');
  utimesSync(metadata, modified, modified);
  if (lease) {
    mkdirSync(join(directory, 'leases'));
    writeFileSync(
      join(directory, 'leases/active.json'),
      lease.corrupted
        ? '{broken\n'
        : `${JSON.stringify(
            lease.legacy
              ? { leaseId: `${name}-lease`, createdAt: lease.heartbeatAt.toISOString() }
              : {
                  schema: 1,
                  leaseId: `${name}-lease`,
                  ownerToken: `${name}-token`,
                  hostname: lease.hostname ?? 'test-host',
                  pid: lease.pid ?? 4242,
                  createdAt: modified.toISOString(),
                  heartbeatAt: lease.heartbeatAt.toISOString(),
                }
          )}\n`
    );
  }
  return directory;
}

function runtime(
  nowMs: () => number,
  live = new Set([4242, process.pid])
): EvalDependencyLeaseRuntime {
  return {
    nowMs,
    hostname: () => 'test-host',
    isProcessAlive: (pid) => live.has(pid),
  };
}

function storeLock(
  storeRoot: string,
  modified: Date,
  owner: 'missing' | 'corrupt' | 'foreign' | 'local-dead'
): string {
  const directory = join(storeRoot, '.dependency-store.lock');
  mkdirSync(directory);
  if (owner === 'corrupt') writeFileSync(join(directory, 'owner.json'), '{broken\n');
  if (owner === 'foreign' || owner === 'local-dead') {
    writeFileSync(
      join(directory, 'owner.json'),
      `${JSON.stringify({
        schema: 1,
        token: 'foreign-token',
        hostname: owner === 'foreign' ? 'foreign-host' : 'test-host',
        pid: owner === 'foreign' ? 4242 : 777,
        createdAt: modified.toISOString(),
      })}\n`
    );
  }
  utimesSync(directory, modified, modified);
  return directory;
}

function dependencySource(): string {
  const root = temporaryRoot();
  const packages: Record<string, unknown> = { '': { name: 'fixture' } };
  const installed: Record<string, unknown> = {};
  for (const [index, name] of EVAL_ALLOWED_DEPENDENCIES.entries()) {
    const entry = {
      version: `1.0.${index}`,
      resolved: `https://registry.invalid/${name}.tgz`,
      integrity: `sha512-${name}`,
    };
    packages[`node_modules/${name}`] = entry;
    installed[`node_modules/${name}`] = entry;
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
  }
  writeFileSync(
    join(root, 'package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages })}\n`
  );
  writeFileSync(
    join(root, 'node_modules/.package-lock.json'),
    `${JSON.stringify({ lockfileVersion: 3, packages: installed })}\n`
  );
  return root;
}

describe('flow-eval dependency-store retention', () => {
  it('never removes an active lease even after the age boundary', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const old = new Date(now.getTime() - 7 * DAY_MS - 1);
    const active = store(storeRoot, 'active', old, { heartbeatAt: now });
    const expired = store(storeRoot, 'expired', old);
    await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      nowMs: now.getTime(),
      runtime: runtime(() => now.getTime()),
    });
    assert.equal(existsSync(expired), false);
    assert.equal(existsSync(active), true);
  });

  it('keeps only the bounded number of newest inactive contracts', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const directories = Array.from({ length: 3 }, (_, index) =>
      store(storeRoot, `contract-${index}`, new Date(now.getTime() - index * 1_000))
    );
    const current = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      nowMs: now.getTime(),
    });
    assert.equal(directories.filter((directory) => existsSync(directory)).length, 1);
    assert.equal(existsSync(directories[0]!), true);
    assert.equal(existsSync(current.directory), true);
  });

  it('refuses a lease for an existing inactive third contract when two others are active', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const existing = await prepareEvalDependencyStore({ sourceRoot, storeRoot });
    assert.equal(existsSync(existing.directory), true);
    const now = new Date('2026-09-24T12:00:00.000Z');
    store(storeRoot, 'active-a', now, { heartbeatAt: now });
    store(storeRoot, 'active-b', now, { heartbeatAt: now });
    await assert.rejects(
      prepareEvalDependencyStore({
        sourceRoot,
        storeRoot,
        leaseId: 'third-active',
        nowMs: now.getTime(),
        runtime: runtime(() => now.getTime()),
      }),
      /retention is full with active contracts/
    );
    assert.equal(existsSync(join(existing.directory, 'leases')), false);
  });

  it('reclaims two expired orphan leases before active-cap and retention decisions', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const first = store(storeRoot, 'orphan-a', stale, { heartbeatAt: stale });
    const second = store(storeRoot, 'orphan-b', stale, { heartbeatAt: stale });
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'replacement',
      nowMs,
      runtime: runtime(() => nowMs),
    });
    assert.ok(prepared.lease);
    assert.equal(
      [first, second].filter((directory) => existsSync(directory)).length,
      1,
      'one inactive orphan may remain within the two-store retention bound beside the new active store'
    );
  });

  it('reclaims the legacy lease schema left by the original lifecycle implementation', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const directory = store(storeRoot, 'legacy-orphan', stale, {
      heartbeatAt: stale,
      legacy: true,
    });
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs,
      runtime: runtime(() => nowMs),
    });
    assert.ok(report.entries.some((entry) => entry.reason === 'legacy-lease-expired'));
    assert.equal(existsSync(join(directory, 'leases/active.json')), false);
  });

  it('releases only an intact lease owned by the current process', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const injected = runtime(() => nowMs);
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'owned-release',
      nowMs,
      runtime: injected,
    });
    await releaseEvalDependencyLease(prepared.lease!, injected);
    assert.equal(existsSync(prepared.lease!.file), false);
  });

  it('retains corrupted lease evidence instead of deleting it during release', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const injected = runtime(() => nowMs);
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'corrupted-release',
      nowMs,
      runtime: injected,
    });
    writeFileSync(prepared.lease!.file, '{broken\n');
    await assert.rejects(
      releaseEvalDependencyLease(prepared.lease!, injected),
      /corrupted dependency lease JSON/
    );
    assert.equal(existsSync(prepared.lease!.file), true);
  });

  it('does not refresh or release a valid replacement lease through the old capability', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const injected = runtime(() => nowMs);
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'capability-replacement',
      nowMs,
      runtime: injected,
    });
    const oldHandle = prepared.lease!;
    const replacement = JSON.parse(readFileSync(oldHandle.file, 'utf8'));
    replacement.ownerToken = 'replacement-owner-token';
    const temporary = `${oldHandle.file}.replacement`;
    writeFileSync(temporary, `${JSON.stringify(replacement)}\n`);
    renameSync(temporary, oldHandle.file);

    const heartbeat = startEvalDependencyLeaseHeartbeat(oldHandle, {
      intervalMs: 5,
      runtime: injected,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await heartbeat.stop();
    assert.match(heartbeat.error()?.message ?? '', /ownership changed before heartbeat/);
    await assert.rejects(
      releaseEvalDependencyLease(oldHandle, injected),
      /ownership changed before release/
    );
    assert.equal(
      JSON.parse(readFileSync(oldHandle.file, 'utf8')).ownerToken,
      replacement.ownerToken
    );
  });

  it('removes its exact heartbeat temp and preserves original lease bytes after atomic write failure', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const injected = runtime(() => nowMs);
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'atomic-heartbeat-failure',
      nowMs,
      runtime: injected,
    });
    const original = readFileSync(prepared.lease!.file, 'utf8');
    const heartbeat = startEvalDependencyLeaseHeartbeat(prepared.lease!, {
      intervalMs: 5,
      runtime: {
        ...injected,
        beforeLeaseTempWrite: () => {
          throw new Error('injected heartbeat temp write failure');
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await heartbeat.stop();
    assert.match(heartbeat.error()?.message ?? '', /injected heartbeat temp write failure/);
    assert.equal(readFileSync(prepared.lease!.file, 'utf8'), original);
    assert.deepEqual(
      readdirSync(dirname(prepared.lease!.file)).filter((name) => name.endsWith('.tmp')),
      []
    );
  });

  it('scheduled heartbeat refreshes a lifecycle-owned lease during a long run', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    let nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const injected = runtime(() => nowMs);
    const prepared = await prepareEvalDependencyStore({
      sourceRoot,
      storeRoot,
      leaseId: 'scheduled-long-run',
      nowMs,
      runtime: injected,
    });
    const heartbeat = startEvalDependencyLeaseHeartbeat(prepared.lease!, {
      intervalMs: 5,
      runtime: injected,
    });
    nowMs += SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    await heartbeat.stop();
    assert.equal(heartbeat.error(), undefined);
    const lease = JSON.parse(readFileSync(prepared.lease!.file, 'utf8'));
    assert.equal(lease.heartbeatAt, new Date(nowMs).toISOString());
    nowMs += SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1;
    const report = await gcEvalDependencyStores(storeRoot, { runtime: injected });
    assert.equal(existsSync(prepared.lease!.file), true);
    assert.ok(
      report.entries.some((entry) => entry.path === prepared.lease!.file && entry.action === 'kept')
    );
  });

  it('reclaims a fresh same-host lease immediately when its owner pid is dead', async () => {
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const directory = store(storeRoot, 'dead-owner', now, { heartbeatAt: now, pid: 777 });
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs: now.getTime(),
      runtime: runtime(() => now.getTime(), new Set()),
    });
    assert.ok(report.entries.some((entry) => entry.reason === 'dead-pid'));
    assert.equal(existsSync(join(directory, 'leases/active.json')), false);
  });

  it('reclaims a stale heartbeat even when the pid number is currently live', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const directory = store(storeRoot, 'stale-live-pid', stale, {
      heartbeatAt: stale,
      pid: 4242,
    });
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs,
      runtime: runtime(() => nowMs),
    });
    assert.ok(report.entries.some((entry) => entry.reason === 'stale-heartbeat'));
    assert.equal(existsSync(join(directory, 'leases/active.json')), false);
  });

  it('rechecks under the store lock and preserves a lease updated between scan and delete', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const directory = store(storeRoot, 'raced', stale, { heartbeatAt: stale });
    const leaseFile = join(directory, 'leases/active.json');
    const injected = runtime(() => nowMs);
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs,
      runtime: {
        ...injected,
        beforeLeaseDelete: async (path) => {
          const lease = JSON.parse(readFileSync(path, 'utf8'));
          lease.heartbeatAt = new Date(nowMs).toISOString();
          writeFileSync(path, `${JSON.stringify(lease)}\n`);
        },
      },
    });
    assert.equal(existsSync(leaseFile), true);
    assert.ok(report.entries.some((entry) => entry.reason === 'changed-before-delete:active'));
  });

  it('protects the whole store when a stale lease identity changes but remains stale', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const directory = store(storeRoot, 'stale-raced', stale, { heartbeatAt: stale });
    const leaseFile = join(directory, 'leases/active.json');
    const injected = runtime(() => nowMs);
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs,
      removeAllInactive: true,
      runtime: {
        ...injected,
        beforeLeaseDelete: async (path) => {
          const lease = JSON.parse(readFileSync(path, 'utf8'));
          lease.ownerToken = 'replacement-stale-token';
          const temporary = `${path}.replacement`;
          writeFileSync(temporary, `${JSON.stringify(lease)}\n`);
          renameSync(temporary, path);
        },
      },
    });
    assert.equal(existsSync(leaseFile), true);
    assert.equal(existsSync(directory), true);
    assert.ok(report.entries.some((entry) => entry.reason === 'changed-before-delete:stale'));
    assert.ok(
      report.entries.some(
        (entry) =>
          entry.path === directory &&
          entry.reason === 'lease identity changed during GC; protected for this pass'
      )
    );
  });

  it('quarantines corrupted lease evidence and refuses automatic reuse or deletion', async () => {
    const sourceRoot = dependencySource();
    const storeRoot = temporaryRoot();
    const now = new Date('2026-09-24T12:00:00.000Z');
    const directory = store(storeRoot, 'corrupted', now, {
      heartbeatAt: now,
      corrupted: true,
    });
    const staleSibling = join(directory, 'leases/stale-sibling.json');
    const staleHeartbeat = new Date(
      now.getTime() - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1
    );
    writeFileSync(
      staleSibling,
      `${JSON.stringify({
        schema: 1,
        leaseId: 'stale-sibling',
        ownerToken: 'stale-sibling-token',
        hostname: 'test-host',
        pid: 4242,
        createdAt: staleHeartbeat.toISOString(),
        heartbeatAt: staleHeartbeat.toISOString(),
      })}\n`
    );
    const injected = runtime(() => now.getTime());
    const report = await gcEvalDependencyStores(storeRoot, {
      nowMs: now.getTime(),
      runtime: injected,
      removeAllInactive: true,
    });
    assert.ok(report.entries.some((entry) => entry.action === 'quarantined'));
    assert.equal(existsSync(directory), true);
    assert.equal(existsSync(staleSibling), true, 'quarantine preserves sibling lease evidence');
    await assert.rejects(
      prepareEvalDependencyStore({
        sourceRoot,
        storeRoot,
        leaseId: 'blocked-by-quarantine',
        nowMs: now.getTime(),
        runtime: injected,
      }),
      /lease quarantine requires operator cleanup/
    );
  });

  it('dry-run reports stale cleanup without deleting and explicit clean keeps active leases', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const stale = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.leaseStaleMs - 1);
    const orphan = store(storeRoot, 'orphan', stale, { heartbeatAt: stale });
    const active = store(storeRoot, 'active', new Date(nowMs), {
      heartbeatAt: new Date(nowMs),
    });
    const injected = runtime(() => nowMs);
    const dry = await gcEvalDependencyStores(storeRoot, {
      dryRun: true,
      removeAllInactive: true,
      runtime: injected,
    });
    assert.ok(dry.entries.some((entry) => entry.action === 'would-remove'));
    assert.equal(existsSync(orphan), true);
    await gcEvalDependencyStores(storeRoot, { removeAllInactive: true, runtime: injected });
    assert.equal(existsSync(orphan), false);
    assert.equal(existsSync(active), true);
  });

  it('dry-run report does not create a missing dependency-store root', async () => {
    const missing = join(temporaryRoot(), 'missing-store-root');
    assert.deepEqual(await gcEvalDependencyStores(missing, { dryRun: true }), { entries: [] });
    assert.equal(existsSync(missing), false);
  });

  it('keeps fresh incomplete locks fail-closed and reclaims them only after the lock TTL', async () => {
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const fresh = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.lockStaleMs + 1);
    const old = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.lockStaleMs - 1);
    for (const owner of ['missing', 'corrupt'] as const) {
      const freshRoot = temporaryRoot();
      const freshLock = storeLock(freshRoot, fresh, owner);
      await assert.rejects(
        gcEvalDependencyStores(freshRoot, {
          nowMs,
          runtime: runtime(() => nowMs),
        }),
        /owner is missing or corrupted but still fresh/
      );
      assert.equal(existsSync(freshLock), true);

      const oldRoot = temporaryRoot();
      const oldLock = storeLock(oldRoot, old, owner);
      await gcEvalDependencyStores(oldRoot, {
        nowMs,
        runtime: runtime(() => nowMs),
      });
      assert.equal(existsSync(oldLock), false);
    }
  });

  it('never age-reclaims a valid foreign-host lock', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const old = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.lockStaleMs - 1);
    const lock = storeLock(storeRoot, old, 'foreign');
    await assert.rejects(
      gcEvalDependencyStores(storeRoot, {
        nowMs,
        runtime: runtime(() => nowMs),
      }),
      /dependency store is busy/
    );
    assert.equal(existsSync(lock), true);
  });

  it('does not delete an active replacement lock when stale recovery identity changes', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const old = new Date(nowMs - SDD_EVAL_RETENTION_POLICY.dependencyStore.lockStaleMs - 1);
    const lock = storeLock(storeRoot, old, 'missing');
    const replacementToken = 'active-replacement-token';
    let replaced = false;
    await assert.rejects(
      gcEvalDependencyStores(storeRoot, {
        nowMs,
        runtime: {
          ...runtime(() => nowMs),
          beforeLockRecoveryDelete: (directory) => {
            if (replaced) return;
            replaced = true;
            const replacement = join(storeRoot, '.replacement-lock');
            mkdirSync(replacement);
            writeFileSync(
              join(replacement, 'owner.json'),
              `${JSON.stringify({
                schema: 1,
                token: replacementToken,
                hostname: 'test-host',
                pid: process.pid,
                createdAt: new Date(nowMs).toISOString(),
              })}\n`
            );
            rmSync(directory, { recursive: true });
            renameSync(replacement, directory);
          },
        },
      }),
      /dependency store is busy/
    );
    assert.equal(existsSync(lock), true);
    assert.equal(
      JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')).token,
      replacementToken
    );
  });

  it('reclaims a fresh valid same-host lock when its owner pid is dead', async () => {
    const storeRoot = temporaryRoot();
    const nowMs = Date.parse('2026-09-24T12:00:00.000Z');
    const lock = storeLock(storeRoot, new Date(nowMs), 'local-dead');
    await gcEvalDependencyStores(storeRoot, {
      nowMs,
      runtime: runtime(() => nowMs, new Set()),
    });
    assert.equal(existsSync(lock), false);
  });

  it('removes its newly-created lock when owner persistence fails', async () => {
    const storeRoot = temporaryRoot();
    await assert.rejects(
      gcEvalDependencyStores(storeRoot, {
        runtime: {
          beforeLockOwnerWrite: () => {
            throw new Error('injected owner write failure');
          },
        },
      }),
      /cannot write dependency store synchronization owner/
    );
    assert.equal(existsSync(join(storeRoot, '.dependency-store.lock')), false);
  });
});
