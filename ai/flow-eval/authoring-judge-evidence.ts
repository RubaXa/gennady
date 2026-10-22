// @file: Source-owned complete artifact evidence for the isolated authoring judge.
// @spec: AI-SKILLS
// @consumers: SddEvalRunner, authoring judge tests

import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import { checkAuthoringBenchmark, getAuthoringCase } from './authoring-benchmark.ts';
import type { AuthoringCaseId } from './authoring-benchmark.ts';

/** @purpose Separate artifact semantics from externally enforced execution/path proof. */
export type AuthoringJudgeEvidence = {
  version: 1;
  target: string;
  complete: boolean;
  sha256?: string;
  content?: string;
  reason?: string;
  oracle?: { pass: boolean; detail: string };
};

/** @purpose Supply an exact bounded artifact, never a diff tail or a worker-authored claim. */
export function captureAuthoringJudgeEvidence(
  root: string,
  caseId: AuthoringCaseId
): AuthoringJudgeEvidence {
  const target = getAuthoringCase(caseId).target;
  const unavailable = (reason: string): AuthoringJudgeEvidence => ({
    version: 1,
    target,
    complete: false,
    reason,
  });
  try {
    const proof = proveRepoFile(root, target);
    if (!proof.ok) return unavailable('artifact missing or unsafe');
    const stat = lstatSync(proof.identity.absolute);
    if (stat.nlink !== 1) return unavailable('artifact is hardlinked');
    if (stat.size > 64 * 1024) return unavailable('artifact exceeds 64 KiB judge bound');
    const read = readProvenRepoFile(proof.identity);
    if (!read.ok) return unavailable('artifact identity changed during capture');
    if (Buffer.byteLength(read.content, 'utf8') > 64 * 1024)
      return unavailable('artifact exceeds 64 KiB judge bound');
    const oracle = checkAuthoringBenchmark(root, caseId);
    return {
      version: 1,
      target,
      complete: true,
      sha256: createHash('sha256').update(read.content).digest('hex'),
      content: read.content,
      oracle: { pass: oracle.pass, detail: oracle.detail },
    };
  } catch {
    // Do not export arbitrary filesystem exception text (paths/credentials) to the model.
    return unavailable('artifact evidence capture failed');
  }
}
