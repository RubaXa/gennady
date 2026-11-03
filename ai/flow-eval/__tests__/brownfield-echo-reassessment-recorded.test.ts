// @file: Replay separately versioned E3 exit-echo reassessments from immutable primary captures; no model, transport or shell execution.
// @spec: AI-SKILLS
// @consumers: clean-clone measurement qualification for PR132

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  brownfieldProposalInvocationProven,
  brownfieldConfirmationAccepted,
} from '../brownfield-benchmark.ts';
import {
  BROWNFIELD_COMMAND_PROOF_REVISION,
  type BrownfieldCommandEvent,
  type BrownfieldCommandCapture,
} from '../brownfield-command-proof.ts';

const root = fileURLToPath(
  new URL('../results/2026-11-03-brownfield-exit-echo-reassessment/', import.meta.url)
);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const load = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T;
type Raw = Parameters<typeof brownfieldConfirmationAccepted>[0] & {
  confirmationAccepted: boolean;
  confirmationStatus: string;
  privateEvidenceSha256: string;
  privateRawMessagesCapture: { gzipSha256: string; bodySha256: string };
  events: Array<{ i: number; callIdentity: string; argumentSha256: string; tool: string }>;
};
type Input = {
  rawRecordPath: string;
  rawRecordSha256: string;
  sourceBindings: {
    privatePrimarySha256: string;
    serverMessagesGzipSha256: string;
    serverMessagesBodySha256: string;
  };
  events: BrownfieldCommandEvent[];
  capture: BrownfieldCommandCapture;
  projection: { privatePublicProofEqual: boolean };
};
type Result = {
  revision: string;
  modelCalls: number;
  newPrimaryAttempts: number;
  priorRawUnchanged: boolean;
  modelBehaviorWinClaimed: boolean;
  sourceHashes: { path: string; sha256: string; snapshot: string }[];
  assessments: Array<{
    label: string;
    inputPath: string;
    inputSha256: string;
    rawRecordPath: string;
    rawRecordSha256: string;
    raw: {
      proposalInvocationProven: boolean;
      confirmationAccepted: boolean;
      confirmationStatus: string;
      judgeVerdict: string;
    };
    reassessed: {
      proposalInvocationProven: boolean;
      confirmationAccepted: boolean;
      confirmationStatus: string;
    };
    privatePublicProofEqual: boolean;
    fullTrajectoryPassClaimed: boolean;
  }>;
};

/** @purpose Bound every frozen byte and forbid missing, extra or symlink evidence. */
function files(directory = root, parent = ''): Map<string, Buffer> {
  assert.equal(lstatSync(directory).isSymbolicLink(), false);
  const out = new Map<string, Buffer>();
  for (const name of readdirSync(directory)) {
    const path = join(directory, name),
      key = parent ? `${parent}/${name}` : name;
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) for (const [child, bytes] of files(path, key)) out.set(child, bytes);
    else {
      assert.equal(stat.isFile(), true);
      out.set(key, readFileSync(path));
    }
  }
  return out;
}
/** @purpose Validate exhaustive membership independently of semantic success flags. */
function authenticate(archive: Map<string, Buffer>) {
  const manifest = JSON.parse(archive.get('manifest.json')!.toString()) as {
    files: Record<string, string>;
  };
  assert.deepEqual(
    Object.keys(manifest.files).sort(),
    [...archive.keys()].filter((path) => path !== 'manifest.json').sort()
  );
  for (const [path, digest] of Object.entries(manifest.files)) {
    assert.ok(!path.split('/').some((part) => !part || part === '.' || part === '..'));
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(sha(archive.get(path)!), digest, path);
  }
}
/** @purpose Read one prior raw only through its declared hash-bound repository evidence path. */
function raw(input: Input): Raw {
  assert.match(
    input.rawRecordPath,
    /^ai\/flow-eval\/results\/2026-11-03-brownfield-(?:e3-e4-confirmation|e3-explicit-command)\/records\/0\.json$/
  );
  const bytes = readFileSync(join(repository, input.rawRecordPath));
  assert.equal(sha(bytes), input.rawRecordSha256);
  return JSON.parse(bytes.toString()) as Raw;
}

test('reassessment archive authenticates every file and Git membership; changed or omitted evidence fails', () => {
  const archive = files();
  authenticate(archive);
  const prefix = relative(repository, root).split('\\').join('/');
  const tracked = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: repository })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((path) => path.slice(prefix.length + 1));
  assert.deepEqual(tracked.sort(), [...archive.keys()].sort());
  const changed = new Map(archive);
  changed.set('reassessment.json', Buffer.from('{}'));
  assert.throws(() => authenticate(changed));
  const missing = new Map(archive);
  missing.delete('inputs/E3-v3-pending.json');
  assert.throws(() => authenticate(missing));
});

test('offline proof gives v3 a separate qualified PASS while prior censored v2 and all raw flags remain unchanged', () => {
  const report = load<Result>('reassessment.json');
  assert.equal(report.revision, BROWNFIELD_COMMAND_PROOF_REVISION);
  assert.equal(report.modelCalls, 0);
  assert.equal(report.newPrimaryAttempts, 0);
  assert.equal(report.priorRawUnchanged, true);
  assert.equal(report.modelBehaviorWinClaimed, false);
  assert.deepEqual(
    report.assessments.map((x) => x.label),
    ['E3-v2-prior-censored', 'E3-v3-pending']
  );
  assert.deepEqual(
    report.assessments.map((x) => x.reassessed.confirmationAccepted),
    [false, true]
  );
  for (const row of report.assessments) {
    assert.equal(sha(readFileSync(join(root, row.inputPath))), row.inputSha256);
    const input = load<Input>(row.inputPath),
      before = raw(input);
    const exactBefore = JSON.stringify(before);
    assert.equal(input.rawRecordPath, row.rawRecordPath);
    assert.equal(input.rawRecordSha256, row.rawRecordSha256);
    assert.equal(input.sourceBindings.privatePrimarySha256, before.privateEvidenceSha256);
    assert.equal(
      input.sourceBindings.serverMessagesGzipSha256,
      before.privateRawMessagesCapture.gzipSha256
    );
    assert.equal(
      input.sourceBindings.serverMessagesBodySha256,
      before.privateRawMessagesCapture.bodySha256
    );
    assert.equal(before.oracle?.proposalInvocationProven, false);
    assert.equal(before.confirmationAccepted, false);
    assert.equal(before.confirmationStatus, 'not-proven');
    assert.equal(row.raw.confirmationAccepted, false);
    assert.equal(row.privatePublicProofEqual, true);
    assert.equal(input.projection.privatePublicProofEqual, true);
    assert.equal(input.events.length, before.events.length);
    input.events.forEach((event, i) => {
      assert.equal(event.i, i);
      assert.equal(event.callId, before.events[i]!.callIdentity);
      assert.equal(sha(event.command ?? event.arg ?? ''), before.events[i]!.argumentSha256);
      assert.equal(event.tool, before.events[i]!.tool);
    });
    const proof = brownfieldProposalInvocationProven(input.events, input.capture);
    assert.equal(proof, row.reassessed.proposalInvocationProven);
    assert.equal(
      brownfieldProposalInvocationProven(input.events),
      false,
      'No capture means no new wrapper proof'
    );
    const accepted = brownfieldConfirmationAccepted({
      ...before,
      oracle: { ...before.oracle, proposalInvocationProven: proof },
    });
    assert.equal(accepted, row.reassessed.confirmationAccepted);
    assert.equal(row.reassessed.confirmationStatus, accepted ? 'proven' : 'not-proven');
    assert.equal(row.fullTrajectoryPassClaimed, false);
    assert.equal(JSON.stringify(before), exactBefore, 'Reassessment never mutates raw');
  }
  for (const source of report.sourceHashes)
    assert.equal(sha(readFileSync(join(root, source.snapshot))), source.sha256);
});

test('captured real wrapper proof rejects transferred identities and incomplete capture; pending remains mandatory', () => {
  const old = load<Input>('inputs/E3-v2-prior-censored.json'),
    fresh = load<Input>('inputs/E3-v3-pending.json');
  assert.equal(brownfieldProposalInvocationProven(old.events, fresh.capture), false);
  assert.equal(brownfieldProposalInvocationProven(fresh.events, old.capture), false);
  assert.equal(
    brownfieldProposalInvocationProven(fresh.events, { ...fresh.capture, complete: false }),
    false
  );
  const before = raw(fresh);
  assert.equal(
    brownfieldConfirmationAccepted({
      ...before,
      oracle: { ...before.oracle, persistencePass: false, proposalInvocationProven: true },
    }),
    false
  );
});

test('published projection contains no original session IDs, host paths, credential values or private source captures', () => {
  for (const [path, bytes] of files())
    if (path.endsWith('.json')) {
      const text = bytes.toString();
      JSON.parse(text);
      assert.doesNotMatch(
        text,
        /\/Users\/|\/private\/|\/var\/folders\/|\bses_[A-Za-z0-9]|\bmsg_[A-Za-z0-9]|Bearer\s+[A-Za-z0-9_.-]{12,}|glpat-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{16,}/,
        path
      );
    }
});
