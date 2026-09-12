// @file: Unit tests for the CLI-owned group-completion receipt — derive, build, format/parse, validity, and the WARN gate.
// @consumers: shared/sdd/group-receipt.ts
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_RECEIPT_MARKER,
  buildGroupReceipt,
  checkGroupReceipts,
  deriveGroupState,
  groupReceiptIssue,
  upsertGroupReceipt,
  type GroupMemberInput,
  type GroupReceipt,
} from '../group-receipt.ts';

const AUDIT_CODE = 'SDD_GROUP_AUDIT_MISSING';
const REVIEW_CODE = 'SDD_GROUP_REVIEW_MISSING';

/** @purpose Narrow a build result to its receipt, failing the test when the writer refused. */
function receiptOf(built: ReturnType<typeof buildGroupReceipt>): GroupReceipt {
  if (!built.ok)
    throw new Error(`expected a minted receipt; refused with: ${built.notDone.join(', ')}`);
  return built.receipt;
}

/** @purpose Count how many receipt blocks of a kind a spec carries (used in place of the private parser). */
function receiptBlockCount(spec: string, kind: 'audit' | 'review'): number {
  return spec.split(`<!--${GROUP_RECEIPT_MARKER[kind]}-->`).length - 1;
}

/** @purpose Build a minimal but structurally valid group-member ticket. */
function member(
  name: string,
  {
    done = true,
    rounds = 1,
    aware = true,
  }: { done?: boolean; rounds?: number; aware?: boolean } = {}
): GroupMemberInput {
  const status = done ? '[x] DONE' : '[ ] TODO';
  const roundBlocks = Array.from(
    { length: rounds },
    (_, i) => `### Round ${i + 1} — 2026-01-0${i + 1}, initial`
  ).join('\n');
  return {
    file: `specs/core/${name}`,
    content: [
      '<!--SECTION:META-->',
      `- **Task-ID:** CORE-${name}`,
      `- **Status:** ${status}`,
      '<!--/SECTION:META-->',
      '',
      '<!--SECTION:EXECUTION_LOG-->',
      '## Execution Log',
      roundBlocks,
      aware ? '<!--PHASE_RECEIPTS:v1-->' : '',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n'),
  };
}

const SPEC_BASE = [
  '# Core spec',
  '<!--SECTION:SCOPE_TYPE-->',
  'product',
  '<!--/SECTION:SCOPE_TYPE-->',
].join('\n');

describe('deriveGroupState', () => {
  it('reports allDone and a stable signature for a complete group', () => {
    const members = [member('core.task.T2.md'), member('core.task.T1.md')];
    const derived = deriveGroupState(members);
    assert.equal(derived.allDone, true);
    assert.deepEqual(derived.members, ['core.task.T1.md', 'core.task.T2.md']); // sorted by basename
    assert.match(derived.signature, /^sha256:[0-9a-f]{64}$/);
    // Deterministic regardless of input order.
    assert.equal(deriveGroupState([...members].reverse()).signature, derived.signature);
  });

  it('lists members that are not DONE and is not complete', () => {
    const derived = deriveGroupState([
      member('core.task.T1.md'),
      member('core.task.T2.md', { done: false }),
    ]);
    assert.equal(derived.allDone, false);
    assert.deepEqual(derived.notDone, ['core.task.T2.md']);
  });

  it('changes signature when a member gains a Round (reopen signal)', () => {
    const before = deriveGroupState([member('core.task.T1.md', { rounds: 1 })]).signature;
    const after = deriveGroupState([member('core.task.T1.md', { rounds: 2 })]).signature;
    assert.notEqual(before, after);
  });

  // B2-02/C7: memberRoundCount already scopes to EXECUTION_LOG (unlike the old nextRoundNumber) —
  // a legacy `## Critic Rounds` section's own `### Round N` headings must not affect the signature.
  it('ignores a `### Round N` heading in a legacy `## Critic Rounds` section outside EXECUTION_LOG', () => {
    const withoutCritic: GroupMemberInput = {
      file: 'specs/core/core.task.T1.md',
      content: [
        '<!--SECTION:META-->',
        '- **Task-ID:** CORE-T1',
        '- **Status:** [x] DONE',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '### Round 1 — 2026-01-01, initial',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
    };
    const withCritic: GroupMemberInput = {
      file: 'specs/core/core.task.T1.md',
      content: [
        '<!--SECTION:META-->',
        '- **Task-ID:** CORE-T1',
        '- **Status:** [x] DONE',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '### Round 1 — 2026-01-01, initial',
        '<!--/SECTION:EXECUTION_LOG-->',
        '## Critic Rounds',
        '### Round 3 — 2026-01-02',
      ].join('\n'),
    };
    assert.equal(
      deriveGroupState([withoutCritic]).signature,
      deriveGroupState([withCritic]).signature
    );
  });
});

describe('buildGroupReceipt', () => {
  it('refuses unless every re-derived member is DONE', () => {
    const built = buildGroupReceipt(
      'audit',
      'specs/core/core.spec.md',
      [member('core.task.T1.md'), member('core.task.T2.md', { done: false })],
      'abc123',
      'PASS',
      '2026-06-21T10:00:00.000Z'
    );
    assert.equal(built.ok, false);
    if (!built.ok) assert.deepEqual(built.notDone, ['core.task.T2.md']);
  });

  it('mints a receipt whose signature matches the live re-derivation', () => {
    const members = [member('core.task.T1.md'), member('core.task.T2.md')];
    const built = buildGroupReceipt(
      'audit',
      'specs/core/core.spec.md',
      members,
      'abc123',
      'PASS',
      'ts'
    );
    assert.equal(built.ok, true);
    if (built.ok) {
      assert.equal(built.receipt.kind, 'audit');
      assert.equal(built.receipt.gitRef, 'abc123');
      assert.equal(built.receipt.verdict, 'PASS');
      assert.equal(built.receipt.signature, deriveGroupState(members).signature);
      assert.equal(groupReceiptIssue(built.receipt, deriveGroupState(members)), null);
    }
  });
});

describe('upsertGroupReceipt', () => {
  it('round-trips a receipt through a spec and keeps exactly one block per kind', () => {
    const members = [member('core.task.T1.md')];
    const spec1 = upsertGroupReceipt(
      SPEC_BASE,
      receiptOf(
        buildGroupReceipt('audit', 'specs/core/core.spec.md', members, 'ref1', 'PASS', 'ts1')
      )
    );
    assert.equal(receiptBlockCount(spec1, 'audit'), 1);

    // Re-recording replaces the prior audit block in place (never a second block).
    const spec2 = upsertGroupReceipt(
      spec1,
      receiptOf(
        buildGroupReceipt('audit', 'specs/core/core.spec.md', members, 'ref2', 'PASS', 'ts2')
      )
    );
    assert.equal(receiptBlockCount(spec2, 'audit'), 1);
    assert.ok(spec2.includes('"gitRef": "ref2"'));
    assert.ok(!spec2.includes('"gitRef": "ref1"'));

    // A review block coexists independently with the audit block.
    const spec3 = upsertGroupReceipt(
      spec2,
      receiptOf(
        buildGroupReceipt('review', 'specs/core/core.spec.md', members, 'ref2', 'PASS', 'ts3')
      )
    );
    assert.equal(receiptBlockCount(spec3, 'audit'), 1);
    assert.equal(receiptBlockCount(spec3, 'review'), 1);
    // The written blocks re-derive cleanly through the public checker.
    assert.deepEqual(checkGroupReceipts([{ specFile: 'x', specContent: spec3, members }]), []);
  });

  it('a malformed block is treated as no valid receipt by the checker', () => {
    const members = [member('core.task.T1.md')];
    const broken = `${SPEC_BASE}\n<!--${GROUP_RECEIPT_MARKER.audit}-->\n\`\`\`json\n{ not json\n\`\`\`\n<!--/${GROUP_RECEIPT_MARKER.audit}-->\n`;
    const findings = checkGroupReceipts([{ specFile: 'x', specContent: broken, members }]);
    assert.ok(findings.some((f) => f.code === AUDIT_CODE));
  });
});

describe('groupReceiptIssue — forge/stale re-derivation gate', () => {
  const members = [member('core.task.T1.md'), member('core.task.T2.md')];
  const built = buildGroupReceipt('audit', 'specs/core/core.spec.md', members, 'ref', 'PASS', 'ts');
  const receipt = receiptOf(built);

  it('accepts a real receipt against the live group', () => {
    assert.equal(groupReceiptIssue(receipt, deriveGroupState(members)), null);
  });

  it('rejects a forged member list', () => {
    const forged: GroupReceipt = { ...receipt, members: ['core.task.T9.md'] };
    assert.notEqual(groupReceiptIssue(forged, deriveGroupState(members)), null);
  });

  it('rejects a stale receipt after a member reopened (Round bumped)', () => {
    const reopened = [member('core.task.T1.md', { rounds: 2 }), member('core.task.T2.md')];
    assert.notEqual(groupReceiptIssue(receipt, deriveGroupState(reopened)), null);
  });

  it('rejects when the group is no longer complete', () => {
    const open = [member('core.task.T1.md', { done: false }), member('core.task.T2.md')];
    assert.notEqual(groupReceiptIssue(receipt, deriveGroupState(open)), null);
  });
});

describe('checkGroupReceipts — WARN gate', () => {
  const members = [member('core.task.T1.md'), member('core.task.T2.md')];
  const specFile = 'specs/core/core.spec.md';

  it('WARNs for a complete v2 group with no receipt', () => {
    const findings = checkGroupReceipts([{ specFile, specContent: SPEC_BASE, members }]);
    const codes = findings.map((f) => f.code).sort();
    assert.deepEqual(codes, [AUDIT_CODE, REVIEW_CODE].sort());
    assert.ok(findings.every((f) => f.severity === 'warn'));
    assert.ok(findings.every((f) => f.file === specFile));
  });

  it('is clean when both valid receipts are present', () => {
    let spec = SPEC_BASE;
    for (const kind of ['audit', 'review'] as const) {
      const built = buildGroupReceipt(kind, specFile, members, 'ref', 'PASS', 'ts');
      assert.ok(built.ok);
      spec = upsertGroupReceipt(spec, receiptOf(built));
    }
    assert.deepEqual(checkGroupReceipts([{ specFile, specContent: spec, members }]), []);
  });

  it('re-WARNs after a member reopened and re-closed (stale receipt)', () => {
    let spec = SPEC_BASE;
    for (const kind of ['audit', 'review'] as const) {
      const built = buildGroupReceipt(kind, specFile, members, 'ref', 'PASS', 'ts');
      assert.ok(built.ok);
      spec = upsertGroupReceipt(spec, receiptOf(built));
    }
    // Reopened then re-closed → complete again, but Round count bumped → signature stale.
    const reclosed = [member('core.task.T1.md', { rounds: 2 }), member('core.task.T2.md')];
    const findings = checkGroupReceipts([{ specFile, specContent: spec, members: reclosed }]);
    assert.deepEqual(findings.map((f) => f.code).sort(), [AUDIT_CODE, REVIEW_CODE].sort());
  });

  it('does not fire for a non-terminal group (a member still TODO) — never per-ticket', () => {
    const inProgress = [member('core.task.T1.md'), member('core.task.T2.md', { done: false })];
    assert.deepEqual(
      checkGroupReceipts([{ specFile, specContent: SPEC_BASE, members: inProgress }]),
      []
    );
  });

  it('grandfathers a group whose members lack the v2 schema marker', () => {
    const legacy = [
      member('core.task.T1.md', { aware: false }),
      member('core.task.T2.md', { aware: false }),
    ];
    assert.deepEqual(
      checkGroupReceipts([{ specFile, specContent: SPEC_BASE, members: legacy }]),
      []
    );
  });

  // B2-16: a group where SOME but not all members carry the marker is an explicit, visible skip —
  // not silence, and not the same as "fully legacy" above.
  it('WARNs explicitly (does not silently skip) a partially-marked group', () => {
    const partial = [
      member('core.task.T1.md', { aware: true }),
      member('core.task.T2.md', { aware: false }),
    ];
    const findings = checkGroupReceipts([{ specFile, specContent: SPEC_BASE, members: partial }]);
    assert.deepEqual(
      findings.map((f) => f.code),
      ['SDD_GROUP_RECEIPT_PARTIALLY_MARKED']
    );
    assert.strictEqual(findings[0]?.severity, 'warn');
    assert.strictEqual(findings[0]?.file, specFile);
  });
});
