// @file: Integration tests for the group-completion receipt WARN gate inside `sdd-check --all`.
// @consumers: sdd-check.cmd
// @tasks: N/A

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildGroupReceipt,
  upsertGroupReceipt,
  type GroupMemberInput,
  type GroupReceiptKind,
} from '../../../../shared/sdd/group-receipt.ts';

type CheckModule = typeof import('../sdd-check.cmd.ts');

let mod: CheckModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origCwd: string;

function ticket(taskId: string, done: boolean, rounds = 1, aware = true): string {
  const roundBlocks = Array.from(
    { length: rounds },
    (_, i) => `### Round ${i + 1} — 2026-01-0${i + 1}, initial`
  ).join('\n');
  return [
    '# ticket',
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId}`,
    `- **Status:** ${done ? '[x] DONE' : '[ ] TODO'}`,
    '<!--/SECTION:META-->',
    '',
    '<!--SECTION:EXECUTION_LOG-->',
    '## Execution Log',
    roundBlocks,
    aware ? '<!--PHASE_RECEIPTS:v1-->' : '',
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

/** @purpose Write a fresh two-ticket group under `specs/core/` and return its root + spec path. */
function makeGroup(
  t1: { done: boolean; rounds?: number; aware?: boolean },
  t2: { done: boolean; rounds?: number; aware?: boolean }
): { root: string; specPath: string; members: GroupMemberInput[] } {
  const root = mkdtempSync(join(tmpdir(), 'sdd-check-group-'));
  const specDir = join(root, 'specs', 'core');
  mkdirSync(specDir, { recursive: true });
  const specPath = join(specDir, 'core.spec.md');
  writeFileSync(specPath, SPEC, 'utf-8');
  const f1 = join(specDir, 'core.task.CORE-a.md');
  const f2 = join(specDir, 'core.task.CORE-b.md');
  writeFileSync(f1, ticket('CORE-a', t1.done, t1.rounds ?? 1, t1.aware ?? true), 'utf-8');
  writeFileSync(f2, ticket('CORE-b', t2.done, t2.rounds ?? 1, t2.aware ?? true), 'utf-8');
  return {
    root,
    specPath,
    members: [
      { file: f1, content: readFileSync(f1, 'utf-8') },
      { file: f2, content: readFileSync(f2, 'utf-8') },
    ],
  };
}

function recordReceipts(specPath: string, members: GroupMemberInput[]): void {
  let spec = readFileSync(specPath, 'utf-8');
  for (const kind of ['audit', 'review'] as GroupReceiptKind[]) {
    const built = buildGroupReceipt(
      kind,
      'specs/core/core.spec.md',
      members,
      'no-head',
      'PASS',
      'ts'
    );
    assert.ok(built.ok);
    if (built.ok) spec = upsertGroupReceipt(spec, built.receipt);
  }
  writeFileSync(specPath, spec, 'utf-8');
}

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-check', ...rest];
}

describe('sdd-check --all group-completion receipt gate', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origCwd = process.cwd();
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-check'];
    mod = await import('../sdd-check.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    process.chdir(origCwd);
  });

  it('WARNs (never errors) when a fully-DONE v2 group has no receipt', async () => {
    const { root } = makeGroup({ done: true }, { done: true });
    const result = await mod.run(argv('--all', root));
    // The codes surface for the completed v2 group; their WARN severity (advisory, non-fatal) is
    // asserted directly in shared/sdd/__tests__/group-receipt.test.ts.
    assert.match(result.text, /SDD_GROUP_AUDIT_MISSING/);
    assert.match(result.text, /SDD_GROUP_REVIEW_MISSING/);
    rmSync(root, { recursive: true, force: true });
  });

  it('is clean once valid audit + review receipts are recorded', async () => {
    const { root, specPath, members } = makeGroup({ done: true }, { done: true });
    recordReceipts(specPath, members);
    const result = await mod.run(argv('--all', root));
    assert.doesNotMatch(result.text, /SDD_GROUP_AUDIT_MISSING/);
    assert.doesNotMatch(result.text, /SDD_GROUP_REVIEW_MISSING/);
    rmSync(root, { recursive: true, force: true });
  });

  it('re-WARNs when a member reopened after the receipt (stale signature)', async () => {
    const { root, specPath, members } = makeGroup({ done: true }, { done: true });
    recordReceipts(specPath, members);
    // Member reopened then re-closed with an extra Round → complete again but signature is stale.
    writeFileSync(
      join(root, 'specs', 'core', 'core.task.CORE-a.md'),
      ticket('CORE-a', true, 2),
      'utf-8'
    );
    const result = await mod.run(argv('--all', root));
    assert.match(result.text, /SDD_GROUP_AUDIT_MISSING/);
    assert.match(result.text, /SDD_GROUP_REVIEW_MISSING/);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not flag a non-terminal group (a member still TODO)', async () => {
    const { root } = makeGroup({ done: true }, { done: false });
    const result = await mod.run(argv('--all', root));
    assert.doesNotMatch(result.text, /SDD_GROUP_AUDIT_MISSING/);
    assert.doesNotMatch(result.text, /SDD_GROUP_REVIEW_MISSING/);
    rmSync(root, { recursive: true, force: true });
  });

  it('grandfathers a DONE group whose tickets predate the v2 schema marker', async () => {
    const { root } = makeGroup({ done: true, aware: false }, { done: true, aware: false });
    const result = await mod.run(argv('--all', root));
    assert.doesNotMatch(result.text, /SDD_GROUP_AUDIT_MISSING/);
    assert.doesNotMatch(result.text, /SDD_GROUP_REVIEW_MISSING/);
    rmSync(root, { recursive: true, force: true });
  });
});
