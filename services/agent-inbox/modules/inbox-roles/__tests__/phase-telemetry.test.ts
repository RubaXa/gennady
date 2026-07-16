// @file: Unit tests for PhaseTelemetry — JSONL append, 7-day GC, and analytics rollup
//   (p50/p95/avg/error-rate per node, per-run totals, slowest phase).
// @consumers: node:test runner
// @tasks: TSK-perf

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTestTmpDir, cleanupTestTmp } from '../../inbox-core/test-support/test-tmp.ts';
import {
  recordPhaseTiming,
  gcStalePhaseTimings,
  readPhaseAnalytics,
  phaseTimingsPath,
  type PhaseTimingEntry,
} from '../phase-telemetry.ts';

const NOW_MS = Date.parse('2026-07-16T12:00:00.000Z');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function entry(overrides: Partial<PhaseTimingEntry>): PhaseTimingEntry {
  return {
    ts: new Date(NOW_MS).toISOString(),
    mr: 'group/proj!1',
    role: 'reviewer',
    node: 'node_track_review',
    model: 'default',
    durationMs: 100,
    ok: true,
    retries: 0,
    ...overrides,
  };
}

let stateDir: string;

beforeEach(() => {
  stateDir = makeTestTmpDir('phase-telemetry-');
});

afterEach(() => {
  cleanupTestTmp(stateDir);
});

describe('PhaseTelemetry', () => {
  it('recordPhaseTiming appends one JSON line, creating telemetry/ lazily', async () => {
    await recordPhaseTiming(stateDir, entry({ node: 'node_a', durationMs: 250 }));
    const filePath = phaseTimingsPath(stateDir);
    assert.ok(existsSync(filePath));

    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim());
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]) as PhaseTimingEntry;
    assert.equal(parsed.node, 'node_a');
    assert.equal(parsed.durationMs, 250);
    assert.equal(parsed.ok, true);
  });

  it('recordPhaseTiming is best-effort — never throws on an unwritable state dir', async () => {
    // A file where a directory is expected makes mkdir(dirname) fail.
    const blocked = join(stateDir, 'blocked-file');
    writeFileSync(blocked, 'not a directory', 'utf-8');
    const bogusStateDir = join(blocked, 'agent-inbox'); // dirname(phaseTimingsPath) under a file, not a dir

    await assert.doesNotReject(() => recordPhaseTiming(bogusStateDir, entry({})));
  });

  it('gcStalePhaseTimings drops lines older than the TTL, keeps fresh ones and malformed-safe', () => {
    const filePath = phaseTimingsPath(stateDir);
    mkdirSync(join(stateDir, 'agent-inbox', 'telemetry'), { recursive: true });

    const staleTs = new Date(NOW_MS - TTL_MS - 60_000).toISOString(); // just past TTL
    const freshTs = new Date(NOW_MS - 60_000).toISOString(); // well within TTL

    const staleLine = JSON.stringify(entry({ ts: staleTs, node: 'node_stale', durationMs: 999 }));
    const freshLine = JSON.stringify(entry({ ts: freshTs, node: 'node_fresh', durationMs: 111 }));
    writeFileSync(filePath, `${staleLine}\n${freshLine}\n`, 'utf-8');

    const removed = gcStalePhaseTimings(stateDir, TTL_MS, NOW_MS);
    assert.equal(removed, 1);

    const remaining = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as PhaseTimingEntry);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].node, 'node_fresh');
  });

  it('gcStalePhaseTimings on a missing file is a no-op', () => {
    assert.equal(gcStalePhaseTimings(stateDir, TTL_MS, NOW_MS), 0);
  });

  it('readPhaseAnalytics computes per-node p50/avg/error-rate and drops entries outside the window', () => {
    const filePath = phaseTimingsPath(stateDir);
    mkdirSync(join(stateDir, 'agent-inbox', 'telemetry'), { recursive: true });

    const withinWindow = new Date(NOW_MS - 60_000).toISOString();
    const outsideWindow = new Date(NOW_MS - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago

    const lines = [
      entry({ ts: withinWindow, node: 'node_a', durationMs: 100, ok: true }),
      entry({ ts: withinWindow, node: 'node_a', durationMs: 200, ok: true }),
      entry({ ts: withinWindow, node: 'node_a', durationMs: 300, ok: false, error: 'TIMEOUT' }),
      entry({ ts: outsideWindow, node: 'node_a', durationMs: 9999, ok: true }), // must be excluded
      entry({ ts: withinWindow, node: 'node_b', durationMs: 50, ok: true }),
    ]
      .map((e) => JSON.stringify(e))
      .join('\n');
    writeFileSync(filePath, `${lines}\n`, 'utf-8');

    const analytics = readPhaseAnalytics(stateDir, 7);

    assert.equal(analytics.entryCount, 4); // the 10-day-old entry is excluded

    const nodeA = analytics.perNode.find((r) => r.node === 'node_a');
    assert.ok(nodeA);
    assert.equal(nodeA!.count, 3);
    assert.equal(nodeA!.avg, 200); // (100+200+300)/3
    assert.equal(nodeA!.p50, 200); // median of [100,200,300]
    assert.ok(Math.abs(nodeA!.errorRate - 1 / 3) < 1e-9);

    const nodeB = analytics.perNode.find((r) => r.node === 'node_b');
    assert.ok(nodeB);
    assert.equal(nodeB!.count, 1);
    assert.equal(nodeB!.errorRate, 0);

    // slowest phase within the window is node_a's 300ms entry, not the excluded 9999ms one
    assert.ok(analytics.slowestPhase);
    assert.equal(analytics.slowestPhase!.durationMs, 300);
    assert.equal(analytics.slowestPhase!.node, 'node_a');

    // one run reconstructed for this mr (all timestamps within RUN_GAP_MS of each other)
    assert.equal(analytics.perRun.length, 1);
    assert.equal(analytics.perRun[0].mr, 'group/proj!1');
    assert.equal(analytics.perRun[0].nodeCount, 4);
  });

  it('readPhaseAnalytics on a missing file returns an empty rollup', () => {
    const analytics = readPhaseAnalytics(stateDir, 7);
    assert.equal(analytics.entryCount, 0);
    assert.deepEqual(analytics.perNode, []);
    assert.deepEqual(analytics.perRun, []);
    assert.equal(analytics.slowestPhase, null);
  });
});
