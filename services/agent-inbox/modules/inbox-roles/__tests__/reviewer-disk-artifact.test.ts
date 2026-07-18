// @file: Unit tests for the TSK-127 disk-artifact review pipeline — review findings come from
//   files the agent writes to disk (validated + correction-looped), never from a forced
//   structured-JSON response that truncates on large MRs.
// @consumers: node:test runner
// @tasks: TSK-127

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewerRole } from '../reviewer.role.ts';
import { RoleInstance } from '../role-instance.ts';
import { OpenCodeMock } from '../../inbox-opencode/opencode.mock.ts';
import type { PromptOpts } from '../../inbox-opencode/opencode.port.ts';
import type { OpenCodeCallResult } from '../../inbox-opencode/errors.ts';
import { VcsInboxMock } from '../../inbox-core/vcs-inbox.mock.ts';
import type { AuditEntry } from '../../inbox-core/audit-log.ts';
import type { RoleGraph, NodeContext } from '../role-node.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

class FakeStateStore {
  public audits: AuditEntry[] = [];
  constructor(private readonly _stateDir: string) {}

  getStateDir() {
    return this._stateDir;
  }

  loadRegistry() {
    return { version: 1, entries: {} };
  }

  async appendAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  async queryAudit(_mr: string): Promise<AuditEntry[]> {
    return [...this.audits];
  }
}

interface StateStore {
  getStateDir(): string;
  loadRegistry(): { version: 1; entries: {} };
  appendAudit(entry: AuditEntry): Promise<void>;
  queryAudit(mr: string): Promise<AuditEntry[]>;
}

/** @purpose OpenCodeMock subclass recording every continueSignal call for correction-loop assertions. */
class SpyOpenCodeMock extends OpenCodeMock {
  public continueSignalCalls: Array<{ sid: string; text: string }> = [];

  override async continueSignal(sid: string, opts: PromptOpts): Promise<OpenCodeCallResult> {
    this.continueSignalCalls.push({ sid, text: opts.text ?? '' });
    return super.continueSignal(sid, opts);
  }
}

let vcs: VcsInboxMock;

before(() => {
  vcs = new VcsInboxMock();
});

beforeEach(() => {
  vcs = new VcsInboxMock();
});

// ─── (a) valid lens artifact on disk → node artifact populated → OK ─────────────

describe('disk-artifact executor — (a) valid artifact on first turn', () => {
  it('GIVEN agent writes a valid lens artifact WHEN step THEN node OK and artifact becomes the node output', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-a-'));
    const artifactFile = '.gennady-artifacts/test_node.json';

    const graph: RoleGraph = {
      nodes: [
        {
          kind: 'session',
          id: 'test_node',
          buildTaskText: () => 'Write findings to disk',
          dir: () => workDir,
          artifact: {
            file: artifactFile,
            schema: {
              type: 'object',
              required: ['findings'],
              properties: { findings: { type: 'array' } },
            },
          },
          policy: { promptTimeout: 5, continueMax: 2, restartMax: 1, tools: true },
        },
        { kind: 'gate', id: 'gate_done', verify: () => ({ pass: true }) },
      ],
      edges: [
        { from: 'test_node', to: 'gate_done', on: 'ok' },
        { from: 'gate_done', to: 'done', on: 'pass' },
      ],
    };

    const opencode = new OpenCodeMock();
    opencode.seed('test_node', {
      writeArtifact: {
        file: artifactFile,
        content: JSON.stringify({ findings: [{ file: 'a.ts', line: 10, message: 'Issue A' }] }),
      },
    });

    const store = new FakeStateStore(mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-state-')));
    const instance = new RoleInstance({
      id: 'reviewer:test:disk-artifact-a',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/101',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step();

    assert.strictEqual(instance.currentNode, 'gate_done');
    assert.strictEqual(instance.state, 'idle');
    const findings = instance.getBoardView().findings as Array<{ file: string }>;
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]!.file, 'a.ts');
    assert.ok(existsSync(join(workDir, artifactFile)));
  });
});

// ─── (b) malformed JSON, then valid on the correction turn ──────────────────────

describe('disk-artifact executor — (b) correction loop', () => {
  it('GIVEN malformed JSON on disk WHEN step THEN continue with a correction signal, then valid JSON succeeds', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-b-'));
    const artifactFile = '.gennady-artifacts/test_node.json';
    const fullPath = join(workDir, artifactFile);

    const graph: RoleGraph = {
      nodes: [
        {
          kind: 'session',
          id: 'test_node',
          buildTaskText: () => 'Write findings to disk',
          dir: () => workDir,
          artifact: {
            file: artifactFile,
            schema: {
              type: 'object',
              required: ['findings'],
              properties: { findings: { type: 'array' } },
            },
          },
          policy: { promptTimeout: 5, continueMax: 2, restartMax: 1, tools: true },
        },
        { kind: 'gate', id: 'gate_done', verify: () => ({ pass: true }) },
      ],
      edges: [
        { from: 'test_node', to: 'gate_done', on: 'ok' },
        { from: 'gate_done', to: 'done', on: 'pass' },
      ],
    };

    const opencode = new SpyOpenCodeMock();
    // Seed a plain ack (no writeArtifact) — the "agent" writes the file itself, below.
    opencode.seed('test_node', { text: 'ack' });

    // Turn 1: agent wrote MALFORMED JSON.
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, '{ "findings": [ bad json');

    const store = new FakeStateStore(mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-state-')));
    const instance = new RoleInstance({
      id: 'reviewer:test:disk-artifact-b',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/102',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step(); // prompt → OK(text) → disk read → PARSE_ERROR → continue

    assert.strictEqual(instance.currentNode, 'test_node', 'stays on the same node for retry');
    assert.strictEqual(instance.continueCount, 1);
    assert.strictEqual(opencode.continueSignalCalls.length, 1);
    assert.ok(
      opencode.continueSignalCalls[0]!.text.includes('not valid JSON'),
      `correction signal should mention invalid JSON: ${opencode.continueSignalCalls[0]!.text}`
    );

    // Turn 2 (the "correction turn"): the agent overwrites the file with valid JSON.
    writeFileSync(fullPath, JSON.stringify({ findings: [] }));

    await instance.step(); // prompt → OK(text) → disk read → OK → transition

    assert.strictEqual(instance.currentNode, 'gate_done');
    assert.strictEqual(instance.continueCount, 0);
  });
});

// ─── (c) agent never writes the file → ladder exhaustion escalates, no crash ────

describe('disk-artifact executor — (c) ladder exhaustion', () => {
  it('GIVEN the agent never creates the artifact file WHEN stepping repeatedly THEN escalates to awaiting_operator', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-c-'));
    const artifactFile = '.gennady-artifacts/test_node.json';

    const graph: RoleGraph = {
      nodes: [
        {
          kind: 'session',
          id: 'test_node',
          buildTaskText: () => 'Write findings to disk',
          dir: () => workDir,
          artifact: { file: artifactFile },
          policy: { promptTimeout: 5, continueMax: 1, restartMax: 1, tools: true },
        },
        { kind: 'gate', id: 'gate_done', verify: () => ({ pass: true }) },
      ],
      edges: [
        { from: 'test_node', to: 'gate_done', on: 'ok' },
        { from: 'gate_done', to: 'done', on: 'pass' },
      ],
    };

    const opencode = new OpenCodeMock();
    opencode.seed('test_node', { text: 'ack — no file written' });

    const store = new FakeStateStore(mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-state-')));
    const instance = new RoleInstance({
      id: 'reviewer:test:disk-artifact-c',
      role: 'reviewer',
      mr: 'https://gitlab.example.com/project/-/merge_requests/103',
      graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    // continueMax=1, restartMax=1 → at most a handful of steps before escalation.
    let guard = 0;
    while (instance.state !== 'escalated' && instance.state !== 'error' && guard < 10) {
      await instance.step();
      guard++;
    }

    // 'escalated', not 'awaiting_operator' — ladder exhaustion never reaches node_ask (TSK-131 P7:
    // these two states used to share one literal, wrongly letting a broken run pass as ask-ready).
    assert.strictEqual(instance.state, 'escalated');
    assert.strictEqual(instance.currentNode, 'test_node');
    assert.ok(
      store.audits.some((a) => a.event === 'escalated'),
      'expected an escalated audit entry'
    );
  });
});

// ─── (d) materializeReviewJson merges lens findings, dedupes, assigns F-ids ─────

describe('reviewer.role.ts — materializeReviewJson merges disk-artifact lens findings', () => {
  it('GIVEN 3 lens artifacts with an overlapping finding WHEN gate_review_synthesis passes THEN review.json has deduped F-id findings', async () => {
    const opencode = new OpenCodeMock();
    const mrUrl = 'https://gitlab.example.com/project/-/merge_requests/104';
    const stateDir = mkdtempSync(join(tmpdir(), 'reviewer-disk-artifact-d-'));
    const store = new FakeStateStore(stateDir);

    const trackFile = '.gennady-artifacts/node_track_review.json';
    const securityFile = '.gennady-artifacts/node_security_lens.json';
    const codeFile = '.gennady-artifacts/node_code_review.json';
    const synthFile = '.gennady-artifacts/node_synthesize.json';

    opencode.seed('node_track_review', {
      writeArtifact: {
        file: trackFile,
        content: JSON.stringify({
          findings: [
            { file: 'a.ts', line: 10, message: 'Issue A' },
            { file: 'b.ts:5', message: 'Issue B' },
          ],
        }),
      },
    });
    opencode.seed('node_security_lens', {
      writeArtifact: {
        file: securityFile,
        // Duplicate of the track lens's "Issue A" — must be deduped, not double-counted.
        content: JSON.stringify({ findings: [{ file: 'a.ts', line: 10, message: 'Issue A' }] }),
      },
    });
    opencode.seed('node_code_review', {
      writeArtifact: {
        file: codeFile,
        content: JSON.stringify({
          findings: [{ file: 'c.ts', line: 1, message: 'Issue C', severity: 'warn' }],
        }),
      },
    });
    opencode.seed('node_synthesize', {
      writeArtifact: {
        file: synthFile,
        content: JSON.stringify({
          reviewReport: { verdict: 'changes_requested', summary: 'Found issues' },
          proposedActions: [],
        }),
      },
    });

    const instance = new RoleInstance({
      id: 'reviewer:test:disk-artifact-d',
      role: 'reviewer',
      mr: mrUrl,
      graph: ReviewerRole.graph,
      opencode,
      vcs,
      store: store as unknown as StateStore,
    });

    await instance.step(); // node_prepare → review_needed
    await instance.step(); // node_review_fanout → all 3 lenses OK
    await instance.step(); // gate_review_filled → pass
    await instance.step(); // node_synthesize → ok
    await instance.step(); // gate_review_synthesis → pass (materializes review.json)

    assert.strictEqual(instance.currentNode, 'node_ask');

    const dir = mrReportsDir(stateDir, 'project!104');
    const reviewJsonPath = join(dir, 'review.json');
    assert.ok(existsSync(reviewJsonPath));
    const review = JSON.parse(readFileSync(reviewJsonPath, 'utf-8')) as {
      verdict: string;
      findings: Array<{
        id: string;
        file: string;
        line: number;
        message: string;
        severity: string;
      }>;
      revision: number;
    };

    assert.strictEqual(review.verdict, 'changes_requested');
    // 3 distinct findings (A, B, C) — the duplicate "Issue A" from the security lens is deduped.
    assert.strictEqual(review.findings.length, 3);
    assert.deepStrictEqual(
      review.findings.map((f) => f.id),
      ['F-1', 'F-2', 'F-3']
    );
    const byFile = Object.fromEntries(review.findings.map((f) => [f.file, f]));
    assert.strictEqual(byFile['a.ts']!.message, 'Issue A');
    assert.strictEqual(byFile['b.ts']!.line, 5);
    assert.strictEqual(byFile['c.ts']!.severity, 'warn');
    assert.strictEqual(review.revision, 1);
  });
});
