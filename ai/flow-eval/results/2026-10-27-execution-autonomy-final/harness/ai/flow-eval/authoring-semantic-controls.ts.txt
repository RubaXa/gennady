// @file: Source-owned semantic calibration pairs, separate from agent outcomes and mechanical grades.
// @spec: AI-SKILLS
// @consumers: authoring judge qualification; deterministic control integrity tests

import { createHash } from 'node:crypto';
import { getAuthoringCase, type AuthoringCaseId } from './authoring-benchmark.ts';
import { REFERENCE_PORTAL, referenceSpec } from './authoring-benchmark-fixtures.ts';

export type AuthoringSemanticControl = {
  id: string;
  caseId: AuthoringCaseId;
  expected: 'pass' | 'fail';
  facet: 'portal-summary' | 'dependency' | 'input-domain';
  artifact: string;
  artifactSha256: string;
  labelEvidence: string;
};

function replaceOnce(text: string, before: string, after: string): string {
  if (text.split(before).length !== 2)
    throw new Error('Semantic control mutation must match exactly once');
  return text.replace(before, after);
}

/** @purpose Return fresh paired fixtures with independently reviewable labels, never relabel saved runs. */
export function buildAuthoringSemanticControls(): AuthoringSemanticControl[] {
  const portal = replaceOnce(
    REFERENCE_PORTAL,
    '- **Принципы:** pure transformation and explicit invalid-input failure.',
    '- **Принципы:** pure transformation; empty, separator-only and non-ASCII input throws TypeError without I/O.'
  );
  const library = replaceOnce(
    referenceSpec('library', getAuthoringCase('scope-library').target),
    'в один hyphen.',
    'в один hyphen и вернуть полученный токен.'
  );
  const disjoint =
    'передана ASCII-строка, которая содержит хотя бы один символ, отличный от пробела, underscore и hyphen';
  const rows: Array<Omit<AuthoringSemanticControl, 'artifactSha256'>> = [
    {
      id: 'portal-summary-valid',
      caseId: 'portal',
      expected: 'pass',
      facet: 'portal-summary',
      artifact: portal,
      labelEvidence:
        'The Vision summary is concise; its principles explicitly reject empty, separator-only and non-ASCII input. No source requirement demands repeating every exception in the opening sentence.',
    },
    {
      id: 'portal-summary-contradiction',
      caseId: 'portal',
      expected: 'fail',
      facet: 'portal-summary',
      artifact: replaceOnce(
        portal,
        'Local CLI and library consumers normalize an ASCII token deterministically.',
        'For every input, including empty, separator-only and non-ASCII strings, the normalizer always returns a string and never throws.'
      ),
      labelEvidence:
        'An explicit always-return/never-throw promise conflicts with the supplied contract and retained rejection clauses. Empty input is a concrete witness.',
    },
    {
      id: 'portal-reversed-dependency',
      caseId: 'portal',
      expected: 'fail',
      facet: 'dependency',
      artifact: replaceOnce(portal, 'token --> infra-base', 'infra-base --> token'),
      labelEvidence:
        'The case explicitly requires token to depend on infra-base, never the reverse. This changes only the graph edge.',
    },
    {
      id: 'library-tooling-dependency-valid',
      caseId: 'scope-library',
      expected: 'pass',
      facet: 'dependency',
      artifact: library,
      labelEvidence:
        'The brief assigns normalization to token/library. The portal edge to infra-base is a tooling dependency; infra-base excludes product algorithms from its own scope, not from its consumer.',
    },
    {
      id: 'library-missing-dependency',
      caseId: 'scope-library',
      expected: 'fail',
      facet: 'dependency',
      artifact: replaceOnce(library, '- **Depends on:** infra-base', '- **Depends on:** None'),
      labelEvidence:
        'The target denies its explicit portal dependency while retaining the same portal and authoring infrastructure reference.',
    },
    {
      id: 'library-ascii-overlap',
      caseId: 'scope-library',
      expected: 'fail',
      facet: 'input-domain',
      artifact: replaceOnce(library, disjoint, 'передана ASCII-строка'),
      labelEvidence:
        'Only the positive trigger is broadened. Empty and separator-only ASCII input now require both normalization and TypeError, with no exception or precedence.',
    },
    {
      id: 'library-nonempty-overlap',
      caseId: 'scope-library',
      expected: 'fail',
      facet: 'input-domain',
      artifact: replaceOnce(library, disjoint, 'передана непустая ASCII-строка'),
      labelEvidence:
        'Excluding empty input is insufficient: separator-only input such as ___--- still triggers both the positive transformation and error obligation.',
    },
  ];
  return rows.map((row) => ({
    ...row,
    artifactSha256: createHash('sha256').update(row.artifact).digest('hex'),
  }));
}
