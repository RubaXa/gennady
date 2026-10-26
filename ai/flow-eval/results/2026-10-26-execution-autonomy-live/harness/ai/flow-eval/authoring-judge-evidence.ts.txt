// @file: Source-owned complete artifact evidence for the isolated authoring judge.
// @spec: AI-SKILLS
// @consumers: SddEvalRunner, authoring judge tests

import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import { checkAuthoringBenchmark, getAuthoringCase } from './authoring-benchmark.ts';
import type { AuthoringCaseId } from './authoring-benchmark.ts';
import { selectedAuthoringTransfer } from './authoring-transfer.ts';

/** @purpose Separate artifact semantics from externally enforced execution/path proof. */
export type AuthoringJudgeEvidence = {
  version: 1;
  target: string;
  complete: boolean;
  sha256?: string;
  content?: string;
  /** @purpose Source-owned task and immutable reference context; never inferred from worker narration. */
  brief?: string;
  references?: Array<{ path: string; content: string; sha256: string }>;
  reason?: string;
  oracle?: { pass: boolean; detail: string };
};

/** @purpose Supply an exact bounded artifact, never a diff tail or a worker-authored claim. */
export function captureAuthoringJudgeEvidence(
  root: string,
  caseId: AuthoringCaseId
): AuthoringJudgeEvidence {
  const definition = getAuthoringCase(caseId);
  const target = definition.target;
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
    const references: NonNullable<AuthoringJudgeEvidence['references']> = [];
    let referenceBytes = Buffer.byteLength(definition.brief);
    for (const [path, expected] of Object.entries(definition.files)) {
      if (!path.startsWith('docs/') && path !== 'specs/README.md' && !path.endsWith('.spec.md'))
        continue;
      const proof = proveRepoFile(root, path);
      if (!proof.ok) return unavailable('source reference missing or unsafe');
      const stat = lstatSync(proof.identity.absolute);
      if (stat.nlink !== 1 || stat.size > 64 * 1024)
        return unavailable('source reference exceeds identity/size bound');
      const source = readProvenRepoFile(proof.identity);
      if (!source.ok || source.content !== expected)
        return unavailable('source reference changed from source-owned facts');
      referenceBytes += Buffer.byteLength(source.content);
      if (referenceBytes > 192 * 1024)
        return unavailable('source references exceed judge context bound');
      references.push({
        path,
        content: source.content,
        sha256: createHash('sha256').update(source.content).digest('hex'),
      });
    }
    const oracle = checkAuthoringBenchmark(root, caseId);
    return {
      version: 1,
      target,
      complete: true,
      sha256: createHash('sha256').update(read.content).digest('hex'),
      content: read.content,
      brief: definition.brief,
      references,
      ...(selectedAuthoringTransfer()
        ? {}
        : { oracle: { pass: oracle.pass, detail: oracle.detail } }),
    };
  } catch {
    // Do not export arbitrary filesystem exception text (paths/credentials) to the model.
    return unavailable('artifact evidence capture failed');
  }
}
