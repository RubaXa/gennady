// @file: Resume only the nine unstarted positions after the reviewed shared routing correction.
// @spec: AI-SKILLS
// @consumers: finite execution-autonomy controller and causal continuation tests

import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import {
  readExecutionContinuation,
  type ExecutionCampaignEntry,
} from './execution-campaign-continuation.ts';

const ORIGINAL = 'ai/flow-eval/results/2026-10-26-execution-autonomy-live';
const CONTINUED = 'ai/flow-eval/results/2026-10-26-execution-autonomy-continued';
const QUALIFIED = 'ai/flow-eval/results/2026-10-27-execution-autonomy-routing-qualification.json';
const ORIGINAL_COMMITS = {
  baseline: '7958ecb0a3cabcfd2ba923d272a65e00a981a0c6',
  candidate: '9d4057dff34261d5aae05ac14ed049fac123d3a8',
};
const CANDIDATE = '6a91aeec357ef10dff23f6f0f19f99b8c365e059';
const PATCH_SHA = 'dd9ed6684949c5bfca2a0bf54b5dd53fce98f21b9ef3c7240a481c7436a5544a';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

/** @purpose Bind both spent stages and the new shared-routing qualification; never restart consumed positions.
 * @param root Repository containing immutable primary evidence.
 * @param schedule Original fixed sixteen-entry source-owned order.
 * @post Returns exactly positions 7..15 plus a pinned baseline-only routing backport; rejects gaps, drift and unsafe cleanup.
 */
export function readExecutionHoldContinuation(
  root: string,
  schedule: readonly ExecutionCampaignEntry[]
) {
  if (existsSync(join(root, 'ai/flow-eval/results/2026-10-27-execution-autonomy-final')))
    throw new Error(
      'The final stage is already reserved/consumed; no live budget remains through this reader'
    );
  const original = readExecutionContinuation(
    root,
    join(root, ORIGINAL),
    schedule,
    ORIGINAL_COMMITS
  );
  if (original.spent !== 2)
    throw new Error('Hold resume requires the original two spent positions');
  const bindings = [...original.provenance.bindings];
  const read = (path: string) => {
    const proof = proveRepoFile(root, path);
    if (!proof.ok) throw new Error('Unsafe/missing hold evidence');
    const bytes = readProvenRepoFile(proof.identity);
    if (!bytes.ok || Buffer.byteLength(bytes.content) > 2_000_000)
      throw new Error('Unbounded/changed hold evidence');
    bindings.push({ path, sha256: sha(bytes.content) });
    return JSON.parse(bytes.content);
  };
  const protocol = read(`${CONTINUED}/protocol.json`);
  if (
    protocol.planned !== 14 ||
    protocol.previouslySpent !== 2 ||
    protocol.model !== 'llm-proxy/deepseek-v4-flash' ||
    JSON.stringify(protocol.commits) !== JSON.stringify(ORIGINAL_COMMITS) ||
    JSON.stringify(protocol.schedule) !== JSON.stringify(schedule.slice(2))
  )
    throw new Error('Hold continuation changed its original matrix/runtime/budget');
  const cleanup = read(`${CONTINUED}/cleanup.json`);
  const hold = read(`${CONTINUED}/hold-decision.json`);
  if (cleanup.safeCleanup !== true || cleanup.rootRemoved !== true || cleanup.recorded !== 5)
    throw new Error('Hold writer cleanup is not proven');
  if (
    hold.classification !== 'shared-routing-readiness-confound' ||
    hold.totalSpent !== 7 ||
    hold.unstarted !== 9 ||
    hold.replacements !== 0
  )
    throw new Error('Hold accounting is not the reviewed seven-spent/nine-unstarted boundary');
  const names = readdirSync(join(root, CONTINUED, 'records')).sort();
  if (JSON.stringify(names) !== JSON.stringify(['0.json', '1.json', '2.json', '3.json', '4.json']))
    throw new Error('Hold records have gaps, additions or renamed attempts');
  for (let i = 0; i < 5; i++) {
    const record = read(`${CONTINUED}/records/${i}.json`);
    if (
      record.caseId !== schedule[i + 2]!.caseId ||
      record.arm !== schedule[i + 2]!.arm ||
      record.originalIndex !== i + 2
    )
      throw new Error('Hold record differs from its original consumed position');
  }
  const qualification = read(QUALIFIED);
  const baseline = qualification.runtimeIdentities?.baseline;
  const candidate = qualification.runtimeIdentities?.candidate;
  if (
    qualification.status !== 'pass' ||
    qualification.model !== 'llm-proxy/deepseek-v4-flash' ||
    qualification.modelCalls !== 0 ||
    qualification.summary?.controls !== 16 ||
    qualification.summary.runtimeDrift !== false ||
    baseline?.baseCommit !== ORIGINAL_COMMITS.baseline ||
    candidate?.baseCommit !== CANDIDATE ||
    typeof baseline.sourcePatch !== 'string' ||
    sha(baseline.sourcePatch) !== PATCH_SHA ||
    baseline.sourcePatchSha256 !== PATCH_SHA ||
    candidate.sourcePatch !== '' ||
    JSON.stringify(baseline.changed) !==
      JSON.stringify(['cli/cmd/sdd-task/help.ts', 'cli/cmd/sdd-task/sdd-task.cmd.ts']) ||
    candidate.changed?.length !== 0
  )
    throw new Error('Shared routing qualification/runtime/backport mismatch');
  for (const arm of ['baseline', 'candidate'] as const) {
    const controls = qualification.controls.filter((item: { arm: string }) => item.arm === arm);
    if (
      controls.length !== 8 ||
      new Set(controls.map((item: { caseId: string }) => item.caseId)).size !== 8 ||
      schedule.some(
        (entry) => !controls.some((item: { caseId: string }) => item.caseId === entry.caseId)
      ) ||
      controls.some(
        (item: Record<string, unknown>) =>
          item.modelCalls !== 0 ||
          item.normalPass !== true ||
          item.brokenRejected !== true ||
          item.brokenFullRejected !== true ||
          item.tamperRejected !== true ||
          item.fullVerificationPass !== true ||
          item.cleanup !== true ||
          (item.initialRouting as { taskPickable?: boolean } | undefined)?.taskPickable !== true
      )
    )
      throw new Error('Incomplete positive/negative/cleanup routing qualification');
    const runtime = qualification.runtimeIdentities[arm];
    if (sha(JSON.stringify(runtime.files)) !== runtime.runtimeDigest)
      throw new Error('Qualified runtime file identity is inconsistent');
  }
  return {
    spent: 7,
    remaining: schedule.slice(7),
    commits: { baseline: ORIGINAL_COMMITS.baseline, candidate: CANDIDATE },
    expectedToolchain: protocol.toolchain as {
      node: string;
      nodeExecutable: string;
      opencodeVersion: string;
    },
    baselinePatch: baseline.sourcePatch as string,
    expectedRuntimeDigests: {
      baseline: baseline.runtimeDigest as string,
      candidate: candidate.runtimeDigest as string,
    },
    provenance: {
      bindings,
      originalBudget: 16,
      replacementAttempts: 0,
      unpairedDiagnostic: schedule[7],
      comparablePairCaseIds: [...new Set(schedule.slice(8).map((entry) => entry.caseId))],
      limitation:
        'New derived routing-corrected baseline versus exact 6a91aeec; never pool old seven attempts or compare the unpaired EX4 diagnostic. Four new pairs maximum, no statistical non-inferiority or universal autonomy/speed claim. The old hold record is preserved, not rewritten as launch authorization.',
    },
  };
}
