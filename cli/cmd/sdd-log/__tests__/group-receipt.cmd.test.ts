// @file: Command tests for `sdd-log audit-receipt`/`review-receipt` — refuses a non-DONE group, writes a valid CLI-owned block.
// @consumers: sdd-log.cmd
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  GROUP_RECEIPT_MARKER,
  type GroupReceipt,
  type GroupReceiptKind,
} from '../../../../shared/sdd/group-receipt.ts';

type LogModule = typeof import('../sdd-log.cmd.ts');

/** @purpose Extract and JSON-parse one written receipt block from a spec (the private parser is not exported). */
function readReceipt(spec: string, kind: GroupReceiptKind): GroupReceipt | null {
  const marker = GROUP_RECEIPT_MARKER[kind];
  const m = spec.match(
    new RegExp(`<!--${marker}-->\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`\\n<!--/${marker}-->`)
  );
  return m ? (JSON.parse(m[1] as string) as GroupReceipt) : null;
}

let mod: LogModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;
let dir: string;
let specDir: string;

const CLOCK = new Date('2026-06-21T10:00:00.000Z');

function ticket(taskId: string, done: boolean): string {
  return [
    '# ticket',
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    `- **Status:** ${done ? '[x] DONE' : '[ ] TODO'}`,
    '<!--/SECTION:META-->',
    '',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    '### Round 1 — 2026-01-01, initial',
    '<!--PHASE_RECEIPTS:v1-->',
    '<!--/SECTION:EXECUTION_LOG-->',
    '',
  ].join('\n');
}

const SPEC = [
  '# Core spec',
  '<!--SECTION:SCOPE_TYPE-->',
  'product',
  '<!--/SECTION:SCOPE_TYPE-->',
  '',
].join('\n');

function writeGroup(t1Done: boolean, t2Done: boolean): void {
  writeFileSync(join(specDir, 'core.spec.md'), SPEC, 'utf-8');
  writeFileSync(join(specDir, 'core.task.CORE-a.md'), ticket('CORE-a', t1Done), 'utf-8');
  writeFileSync(join(specDir, 'core.task.CORE-b.md'), ticket('CORE-b', t2Done), 'utf-8');
}

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-log', ...rest];
}

describe('sdd-log group-completion receipt', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-log'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-log-group-'));
    specDir = join(dir, 'specs', 'core');
    mkdirSync(specDir, { recursive: true });
    process.chdir(dir);
    mod = await import('../sdd-log.cmd.ts');
  });

  beforeEach(() => {
    process.chdir(dir);
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses when a group member is not DONE and leaves the spec byte-identical', async () => {
    writeGroup(true, false);
    const before = readFileSync(join(specDir, 'core.spec.md'), 'utf-8');
    const outcome = await mod.run(
      argv('specs/core/core.task.CORE-a.md', 'audit-receipt', 'PASS'),
      CLOCK,
      dir
    );
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.code, 'ERR_CLI_SDD_LOG_GROUP_RECEIPT_STATE');
      assert.match(outcome.message, /CORE-b\.md/);
    }
    assert.equal(readFileSync(join(specDir, 'core.spec.md'), 'utf-8'), before);
  });

  it('writes a valid, re-derivable audit receipt on the owning spec when every member is DONE', async () => {
    writeGroup(true, true);
    const outcome = await mod.run(
      argv('specs/core/core.task.CORE-a.md', 'audit-receipt', 'PASS'),
      CLOCK,
      dir
    );
    assert.equal(outcome.ok, true);
    const spec = readFileSync(join(specDir, 'core.spec.md'), 'utf-8');
    const receipt = readReceipt(spec, 'audit');
    assert.ok(receipt);
    assert.equal(receipt?.kind, 'audit');
    assert.equal(receipt?.verdict, 'PASS');
    assert.deepEqual(receipt?.members, ['core.task.CORE-a.md', 'core.task.CORE-b.md']);
    assert.equal(receipt?.ts, CLOCK.toISOString());
  });

  it('resolves the group from a bare Task-ID and records the review receipt independently', async () => {
    writeGroup(true, true);
    const audit = await mod.run(argv('CORE-a', 'audit-receipt', 'PASS'), CLOCK, dir);
    assert.equal(audit.ok, true);
    const review = await mod.run(argv('CORE-b', 'review-receipt', 'PASS'), CLOCK, dir);
    assert.equal(review.ok, true);
    const spec = readFileSync(join(specDir, 'core.spec.md'), 'utf-8');
    assert.equal(readReceipt(spec, 'audit')?.verdict, 'PASS');
    assert.equal(readReceipt(spec, 'review')?.verdict, 'PASS');
  });

  it('rejects an empty verdict', async () => {
    writeGroup(true, true);
    const outcome = await mod.run(argv('CORE-a', 'audit-receipt'), CLOCK, dir);
    assert.equal(outcome.ok, false);
  });
});
