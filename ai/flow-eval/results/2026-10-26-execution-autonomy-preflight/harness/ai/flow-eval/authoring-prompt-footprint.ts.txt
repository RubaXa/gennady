// @file: Exact static instruction footprint for the predeclared module placement experiment.
// @spec: AI-SKILLS
// @consumers: authoring protocol, controlled comparison

import { createHash } from 'node:crypto';
import { proveRepoFile, readProvenRepoFile } from '../../shared/common/repo-file-identity.ts';
import { countTokens } from '../../shared/common/tokens.ts';
import { TEMPLATES } from '../../shared/sdd/templates.ts';
import { renderManifestTable } from '../../cli/cmd/sdd-new/sdd-new.types.ts';
import type { AuthoringCaseId } from './authoring-benchmark.ts';

export type AuthoringPromptFootprint = {
  schema: 'gennady.authoring-instruction-envelope.1';
  bytes: number;
  approximateTokens: number;
  digest: string;
  parts: Array<{ name: string; bytes: number; approximateTokens: number; sha256: string }>;
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** @purpose Count all three competing instruction channels and unchanged external contracts.
 * This is an exact static envelope, not a claim about the provider tokenizer or actual context loaded.
 */
export function measureAuthoringPromptFootprint(
  root: string,
  caseId: AuthoringCaseId
): AuthoringPromptFootprint | undefined {
  if (caseId !== 'module-flat' && caseId !== 'module-nested') return undefined;
  const texts: Array<[string, string]> = [
    ['module.skeleton', TEMPLATES.module.skeleton],
    ['module.manifest', renderManifestTable(TEMPLATES.module.sections)],
  ];
  for (const name of [
    'module.directive.xml',
    'formats/entity-inventory-format.xml',
    'formats/entity-surface-format.xml',
    'formats/dbc-contracts.xml',
  ]) {
    const proof = proveRepoFile(root, `ai/directives/sdd-v2/${name}`);
    if (!proof.ok) throw new Error(`Unsafe or missing experiment instruction: ${name}`);
    const read = readProvenRepoFile(proof.identity);
    if (!read.ok) throw new Error(`Experiment instruction identity changed: ${name}`);
    texts.push([name, read.content]);
  }
  const parts = texts.map(([name, text]) => ({
    name,
    bytes: Buffer.byteLength(text),
    approximateTokens: countTokens(text),
    sha256: hash(text),
  }));
  return {
    schema: 'gennady.authoring-instruction-envelope.1',
    bytes: parts.reduce((sum, item) => sum + item.bytes, 0),
    approximateTokens: parts.reduce((sum, item) => sum + item.approximateTokens, 0),
    digest: hash(JSON.stringify(parts)),
    parts,
  };
}
