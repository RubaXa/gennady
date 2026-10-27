// @file: Continue only unstarted pairs within the original finite budget; never replace invalid attempts.
// @spec: AI-SKILLS
// @consumers: execution-autonomy-live controller and finite-budget regression tests

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import type { ExecutionAutonomyCaseId } from './execution-autonomy-cases.ts';

/** @purpose A preregistered case/runtime attempt, not a retry permission. */
export type ExecutionCampaignEntry = {
  /** @purpose Source-owned matrix identity. */
  caseId: ExecutionAutonomyCaseId;
  /** @purpose Exact runtime arm. */
  arm: 'baseline' | 'candidate';
};

/** @purpose Bind an interrupted, invalid-fixture prefix and return only the original unstarted pairs.
 * @param root Repository boundary for prior public evidence.
 * @param directory Previous campaign's exact results directory.
 * @param schedule Original fixed sixteen-entry order.
 * @param commits Exact baseline/candidate identities; continuation may not silently change them.
 * @post Supplies remaining schedule and hash-bound provenance; throws on gaps, unsafe cleanup or a changed matrix.
 */
export function readExecutionContinuation(
  root: string,
  directory: string,
  schedule: readonly ExecutionCampaignEntry[],
  commits: { baseline: string; candidate: string }
) {
  const prefix = relative(root, resolve(directory)).replaceAll('\\', '/');
  if (!prefix.startsWith('ai/flow-eval/results/'))
    throw new Error('Continuation must reference repository-owned prior evidence');
  const bindings: Array<{ path: string; sha256: string }> = [];
  const read = (name: string) => {
    const proof = proveRepoFile(root, `${prefix}/${name}`);
    if (!proof.ok) throw new Error('Unsafe/missing continuation evidence');
    const bytes = readProvenRepoFile(proof.identity);
    if (!bytes.ok || Buffer.byteLength(bytes.content) > 2_000_000)
      throw new Error('Unbounded/changed continuation evidence');
    bindings.push({
      path: `${prefix}/${name}`,
      sha256: createHash('sha256').update(bytes.content).digest('hex'),
    });
    return JSON.parse(bytes.content);
  };
  const protocol = read('protocol.json');
  if (
    schedule.length !== 16 ||
    protocol.planned !== 16 ||
    protocol.model !== 'llm-proxy/deepseek-v4-flash' ||
    JSON.stringify(protocol.schedule) !== JSON.stringify(schedule) ||
    JSON.stringify(protocol.commits) !== JSON.stringify(commits)
  )
    throw new Error('Continuation changed the original matrix, runtime or budget');
  const recovery = read('cleanup-recovery.json');
  if (recovery.rootRemoved !== true || recovery.privateConfigRemoved !== true)
    throw new Error('Prior writer recovery is incomplete');
  const invalidation = read('stand-invalidation.json');
  if (
    invalidation.classification !== 'invalid-fixture-full-audit' ||
    invalidation.replaceAttempts !== false
  )
    throw new Error('Require an explicit stand invalidation without replacement permission');
  const names = readdirSync(resolve(directory, 'records')).sort(
    (a, b) => Number.parseInt(a) - Number.parseInt(b)
  );
  if (names.length < 2 || names.length >= 16 || names.length % 2 !== 0)
    throw new Error('Continuation needs a complete spent pair-prefix and remaining budget');
  for (const [index, name] of names.entries()) {
    if (name !== `${index}.json`)
      throw new Error('Continuation records have a gap or unsupported entry');
    const record = read(`records/${name}`);
    if (record.caseId !== schedule[index]!.caseId || record.arm !== schedule[index]!.arm)
      throw new Error('Continuation record identity differs from the original order');
  }
  const invalidCases = [...new Set(schedule.slice(0, names.length).map((entry) => entry.caseId))];
  if (schedule.slice(names.length).some((entry) => invalidCases.includes(entry.caseId)))
    throw new Error('A consumed case would be repeated under a new fixture');
  return {
    spent: names.length,
    remaining: schedule.slice(names.length),
    provenance: {
      priorDirectory: prefix,
      bindings,
      invalidCases,
      replacementAttempts: 0,
      originalBudget: 16,
      limitation:
        'Consumed invalid-fixture cases remain NOT PROVEN; never pool fixture versions or claim sixteen valid attempts.',
    },
  };
}
