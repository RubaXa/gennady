// @file: Causal fixture controls for the finite brownfield campaign; no model or project-wide gates.
// @spec: AI-SKILLS
// @consumers: BF3 installed-package qualification

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
  brownfieldCampaign,
  brownfieldCampaignFiles,
  brownfieldConfirmationAccepted,
  brownfieldProposalInvocationProven,
  EXTRA,
  SOURCE,
  TASK,
  TEST,
  e2source,
  files,
  registry,
  minimalCommentLanguageDiff,
} from '../brownfield-benchmark.ts';

/** @purpose Run only protected fixture tests with a host-supplied source value; no model or installed CLI. */
function oracleWithValue(value: number): number | null {
  const root = mkdtempSync(join(tmpdir(), 'brownfield-oracle-'));
  try {
    for (const [path, content] of Object.entries(files('E4'))) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    writeFileSync(join(root, SOURCE('E4')), `// @spec: BF\nmodule.exports = ${value};\n`);
    writeFileSync(join(root, EXTRA), '// @spec: BF\nmodule.exports = 9;\n');
    const result = spawnSync(process.execPath, ['--test', TEST], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: dirname(process.execPath), NO_COLOR: '1' },
    });
    assert.ifError(result.error);
    return result.status;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fixed functional oracle accepts the reference and rejects the wrong provider', () => {
  assert.equal(oracleWithValue(7), 0);
  assert.notEqual(oracleWithValue(8), 0);
});

test('literal route and future phase are exact declarations, not a flattened path or completed input', () => {
  const fixture = files('E4');
  assert.ok(SOURCE('E4').includes('[...slug]'));
  assert.ok(Object.hasOwn(fixture, SOURCE('E4')));
  assert.equal(Object.hasOwn(fixture, EXTRA), false, 'future output must be produced in P2');
  assert.match(fixture[TASK]!, /Target Files:\*\* `pages\/\[\.\.\.slug\]\.cts`/);
  assert.match(fixture[TASK]!, /<!--SECTION:PHASE_P2-->/);
  assert.doesNotMatch(fixture[TASK]!, /SDD_VERIFY_EVIDENCE|SDD_AUDIT_RECEIPT|SDD_REVIEW_RECEIPT/);
});

test('policy fixture preserves an existing unowned project background and asks before policy mutation', () => {
  const fixture = files('E2', ['src/existing.js', 'pages/[section].tsx']);
  assert.equal(fixture['bf-work/value.ts'], e2source);
  assert.match(
    fixture['inputs/brief.md']!,
    /do not edit config before a separate host operator reply/i
  );
  assert.equal(fixture['gennady.yaml']!.includes('commentLanguage'), false);
  assert.equal(
    Object.hasOwn(fixture, 'src/existing.js'),
    false,
    'background is exported, not replaced'
  );
  assert.equal(Object.hasOwn(fixture, 'pages/[section].tsx'), false);
});

test('proposal fixture supplies no accepted decision or reference answer and distinguishes API capability', () => {
  const fixture = files('E3');
  assert.equal(
    Object.keys(fixture).some((path) => path.startsWith('golden/')),
    false
  );
  assert.equal(
    Object.keys(fixture).some((path) => path.includes('proposal.json')),
    false
  );
  assert.doesNotMatch(fixture[registry.module]!, /\[verdict:/);
  assert.match(fixture['inputs/brief.md']!, /operator has NOT accepted/i);
  assert.match(fixture['inputs/brief.md']!, /If unsupported, do NOT probe or bypass/i);
  assert.match(fixture['inputs/brief.md']!, /leave the payload for operator review/i);
});

test('language policy oracle accepts equivalent insertion order and quotes without changing prior bytes', () => {
  const initial = '# Keep project comments.\nlint:\n  scope: owned\n';
  assert.equal(minimalCommentLanguageDiff(initial, initial + '  commentLanguage: ru\n'), true);
  assert.equal(
    minimalCommentLanguageDiff(
      initial,
      '# Keep project comments.\nlint:\n  commentLanguage: "ru"\n  scope: owned\n'
    ),
    true
  );
  assert.equal(
    minimalCommentLanguageDiff(
      initial,
      "# Keep project comments.\nlint:\n  commentLanguage: 'ru'\n  scope: owned\n"
    ),
    true
  );
  for (const actual of [
    initial,
    initial + '  commentLanguage: en\n',
    initial + '  commentLanguage: ru\n  commentLanguage: ru\n',
    initial + '  commentLanguage: ru\n  another: true\n',
    initial.replace('owned', 'all') + '  commentLanguage: ru\n',
    initial.replace('# Keep project comments.\n', '') + '  commentLanguage: ru\n',
  ])
    assert.equal(minimalCommentLanguageDiff(initial, actual), false, actual);
  // A declined or absent operator response cannot be inferred from a semantically valid diff.
  const actual = initial + '  commentLanguage: ru\n';
  for (const hostConsent of [false, true])
    assert.equal(hostConsent && minimalCommentLanguageDiff(initial, actual), hostConsent);
});

test('confirmation has exactly two candidate-only positions and never replaces the original eight', () => {
  const original = brownfieldCampaign('--live');
  assert.equal(original.positions.length, 8);
  assert.deepEqual(
    original.positions.map((p) => `${p.caseId}/${p.arm}`),
    [
      'E1/baseline',
      'E1/candidate',
      'E2/candidate',
      'E2/baseline',
      'E3/baseline',
      'E3/candidate',
      'E4/candidate',
      'E4/baseline',
    ]
  );
  const confirmation = brownfieldCampaign('--confirm-live');
  assert.equal(confirmation.live, true);
  assert.equal(confirmation.confirmation, true);
  assert.deepEqual(confirmation.positions, [
    { caseId: 'E3', arm: 'candidate' },
    { caseId: 'E4', arm: 'candidate' },
  ]);
  assert.equal(brownfieldCampaign('--confirm-qualify-only').live, false);
  assert.equal(brownfieldCampaign('--qualify-only').confirmation, false);
  for (const mode of [undefined, '--retry', '--cases=E1', '--confirm'])
    assert.throws(() => brownfieldCampaign(mode));
  assert.throws(() => {
    (confirmation.positions as unknown as unknown[]).push({});
  });
});

test('functional confirmation requires real pending persistence or full independently reviewed closure', () => {
  const common = {
    terminal: 'completed-worker',
    functional: true,
    domainPass: true,
    writeBoundary: true,
    runtimeIntact: true,
    traceComplete: true,
    providerError: false,
    trajectoryStatus: 'not-proven',
    judgeVerdict: 'pass',
    cleanup: { safeCleanup: true, rootRemoved: true },
  };
  const e3 = {
    ...common,
    caseId: 'E3',
    oracle: { commonPass: true, persistencePass: true, proposalInvocationProven: true },
  };
  const e4 = {
    ...common,
    caseId: 'E4',
    oracle: { phase2Dispatched: true, canonicalPassJournal: true },
    hostReviewReceipt: { exit: 0 },
  };
  assert.equal(brownfieldConfirmationAccepted(e3), true);
  assert.equal(brownfieldConfirmationAccepted(e4), true);
  for (const record of [e3, e4]) {
    for (const key of [
      'functional',
      'domainPass',
      'writeBoundary',
      'runtimeIntact',
      'traceComplete',
    ] as const)
      assert.equal(brownfieldConfirmationAccepted({ ...record, [key]: false }), false);
    for (const terminal of ['budget-exhausted', 'policy-censored', 'worker-error'])
      assert.equal(brownfieldConfirmationAccepted({ ...record, terminal }), false);
    for (const judgeVerdict of ['fail', 'unknown'])
      assert.equal(brownfieldConfirmationAccepted({ ...record, judgeVerdict }), false);
    assert.equal(brownfieldConfirmationAccepted({ ...record, providerError: true }), false);
    assert.equal(
      brownfieldConfirmationAccepted({ ...record, trajectoryStatus: 'violated' }),
      false
    );
    assert.equal(
      brownfieldConfirmationAccepted({
        ...record,
        cleanup: { safeCleanup: true, rootRemoved: false },
      }),
      false
    );
  }
  assert.equal(
    brownfieldConfirmationAccepted({ ...e3, oracle: { commonPass: true, persistencePass: false } }),
    false
  );
  for (const exit of [null, 1])
    assert.equal(brownfieldConfirmationAccepted({ ...e4, hostReviewReceipt: { exit } }), false);
  assert.equal(brownfieldConfirmationAccepted({ ...e4, hostReviewReceipt: undefined }), false);
  assert.equal(
    brownfieldConfirmationAccepted({
      ...e4,
      oracle: { phase2Dispatched: true, canonicalPassJournal: false },
    }),
    false
  );
});

test('proposal proof needs actual lint before the successful CLI and rejects edited-only, echo and unknown compound evidence', () => {
  const lint = {
    i: 1,
    tool: 'bash',
    status: 'completed',
    exitCode: 1,
    command: `npx --no-install gennady lint ${registry.source}`,
  };
  const proposal = {
    i: 2,
    tool: 'bash',
    status: 'completed',
    exitCode: 0,
    command: `npx --no-install gennady sdd-log ${registry.module} decision --payload-file .claude/tmp/lint-proposal.json`,
  };
  assert.equal(brownfieldProposalInvocationProven([lint, proposal]), true);
  for (const events of [
    [],
    [proposal],
    [{ ...lint, i: 3 }, proposal],
    [lint, { ...proposal, exitCode: 1 }],
    [lint, { ...proposal, exitCode: undefined }],
    [lint, { ...proposal, command: `echo ${proposal.command}` }],
    [lint, { ...proposal, command: `${proposal.command} && true` }],
    [lint, proposal, { i: 3, tool: 'edit', arg: registry.module }],
    [{ ...lint, command: 'npx --no-install gennady lint bf-work/other.cts' }, proposal],
  ])
    assert.equal(brownfieldProposalInvocationProven(events), false);
});

test('confirmation overlay only isolates host shell caches and names the existing inventory diagnostic; original fixtures remain unchanged', () => {
  const original = files('E3');
  assert.equal(original['.gitignore'], 'node_modules/\n.claude/tmp/\n');
  assert.deepEqual(brownfieldCampaignFiles('E3', [], false), original);
  const confirmation = brownfieldCampaignFiles('E3', [], true);
  assert.deepEqual(Object.keys(confirmation), Object.keys(original));
  for (const path of Object.keys(original)) {
    if (path === '.gitignore' || path === 'inputs/brief.md') continue;
    assert.equal(confirmation[path], original[path], path);
  }
  assert.equal(
    confirmation['.gitignore'],
    original['.gitignore'] + '.sdd-eval-shell-home/\n.sdd-eval-shell-tmp/\n'
  );
  assert.ok(confirmation['inputs/brief.md']!.startsWith(original['inputs/brief.md']!));
  assert.ok(
    confirmation['inputs/brief.md']!.includes(`lint --spec=${registry.module} ${registry.source}`)
  );
  assert.ok(
    confirmation['inputs/brief.md']!.includes(
      `npx --no-install gennady sdd-log ${registry.module} decision --payload-file .claude/tmp/lint-proposal.json`
    )
  );
  assert.match(confirmation['inputs/brief.md']!, /subcommand shorthand/);
  assert.deepEqual(brownfieldCampaignFiles('E4', [], true), files('E4'));
});
