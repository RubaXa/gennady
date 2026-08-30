// @file: Golden differential test — every check-anchored skeleton in templates.ts, run through the
//   exact pre-commit formatter (prettier, this repo's .prettierrc.json, markdown parser), must trigger
//   the same finding-set from check.ts before and after formatting. Guards the 2026-08-22 incident
//   class: pre-commit prettier inserted a blank line between a diagram fence and its caption, and the
//   caption checker (fixed since) read that as 7 missing captions on already-approved specs. Any future
//   check that is not blank-line/whitespace tolerant will fail this test the moment the skeleton it
//   reads is reformatted — before it ever reaches a human's approved spec.
// @consumers: templates, check
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { format, resolveConfig, type Options } from 'prettier';
import { TEMPLATES, type ArtifactKind } from '../templates.ts';
import {
  checkSpecStructure,
  checkSpecLanguage,
  checkReviewState,
  checkScopeDeps,
  checkRequirementIds,
  checkRequirementBudgetsAgainstBaseline,
  checkDecisionLogIds,
  checkRequirementUnhappyPath,
  checkDiagramCaptions,
  checkScopeDataFlowDiagram,
  checkModuleCallChain,
  checkDeltaDiagram,
  checkTicket,
  checkTaskIdGrammar,
  isTicket,
  type Finding,
} from '../check.ts';
import { checkSpecMermaid } from '../mermaid-check.ts';

// Kinds this golden test covers: every .spec.md-shaped scope/module skeleton, plus task (the ticket
// skeleton) and research (the MADR-hybrid skeleton) — exactly "все kinds с .spec.md-скелетами + task +
// research" per the audit brief. module-index/scope-index/project-index/portal are graph-level
// artifacts (no SECTION anchors, corpus-wide checks) and are out of scope for a single-file
// differential test.
const GOLDEN_KINDS: ArtifactKind[] = [
  'product',
  'library',
  'infrastructure',
  'interface',
  'module',
  'task',
  'research',
];

// A representative fake path per kind — real enough for deriveSpecAcronym / section extraction, never
// touching disk.
const FAKE_FILE: Record<(typeof GOLDEN_KINDS)[number], string> = {
  product: 'specs/demo/demo.spec.md',
  library: 'specs/demo/demo.spec.md',
  infrastructure: 'specs/demo/demo.spec.md',
  interface: 'specs/demo/demo.spec.md',
  module: 'specs/demo/mod/mod.spec.md',
  task: 'specs/demo/demo.task.demo-slug.md',
  research: 'specs/demo/research/2026-01-01-demo.research.md',
};

// Repo root, derived from this file's own path (three levels up: __tests__ → sdd → shared) — resolving
// prettier's config this way keeps the test independent of the runner's cwd.
const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

let cachedConfig: Options | null | undefined;

/**
 * @purpose Resolve prettier's own config exactly as `npm run format` (pre-commit's `prettier --write .`)
 * would for a markdown file — the same .prettierrc.json, cosmiconfig-resolved, memoized once.
 */
async function prettierConfig(): Promise<Options> {
  if (cachedConfig === undefined) {
    cachedConfig = await resolveConfig(join(REPO_ROOT, 'specs', 'probe.spec.md'));
  }
  return cachedConfig ?? {};
}

/** @purpose Format `content` exactly as pre-commit's `prettier --write .` would format `file`. */
async function formatLikePreCommit(file: string, content: string): Promise<string> {
  const config = await prettierConfig();
  return format(content, { ...config, filepath: file });
}

/**
 * @purpose Every check.ts finding relevant to a spec/module/task/research artifact, run over one
 * isolated skeleton — mirrors sdd-check.cmd.ts's per-file dispatch closely enough for a differential
 * test (checks guarded by an absent section/marker no-op harmlessly on kinds they don't apply to, so
 * running the full battery uniformly is simpler than re-deriving the CLI's kind switch and no less
 * accurate). `flowVersion` is pinned to 'v2' — the skeletons are the v2 contract's own canonical text.
 */
async function runCheckBattery(file: string, content: string): Promise<Finding[]> {
  const findings: Finding[] = [
    ...checkSpecStructure(file, content, 'v2'),
    ...checkSpecLanguage(file, content),
    ...checkReviewState(file, content),
    ...checkScopeDeps(file, content, []),
    ...checkRequirementIds(file, content),
    ...checkRequirementBudgetsAgainstBaseline(file, content, null),
    ...checkDecisionLogIds(file, content),
    ...checkRequirementUnhappyPath(file, content),
    ...checkDiagramCaptions(file, content),
    ...checkScopeDataFlowDiagram(file, content),
    ...checkModuleCallChain(file, content),
    ...checkDeltaDiagram(file, content),
  ];
  if (isTicket(content)) {
    findings.push(...checkTicket(file, content));
    findings.push(...checkTaskIdGrammar(file, content));
  }
  findings.push(...(await checkSpecMermaid(file, content)));
  return findings;
}

/**
 * @purpose Findings reduced to a comparable, formatting-noise-free key: severity + code, sorted. Drops
 * `message`/`line` on purpose — prettier's blank-line insertions legitimately shift line numbers and
 * can reflow a quoted sentence's surrounding whitespace without changing what was actually found; the
 * differential property is about the finding SET, not its exact text position.
 */
function findingKeys(findings: Finding[]): string[] {
  return findings.map((f) => `${f.severity}:${f.code}`).sort();
}

describe('skeleton format differential — prettier must not change the checker finding-set', () => {
  for (const kind of GOLDEN_KINDS) {
    describe(kind, () => {
      const file = FAKE_FILE[kind];
      const raw = TEMPLATES[kind].skeleton;

      it('prettier actually reformats this skeleton (sanity — otherwise this test proves nothing)', async () => {
        const formatted = await formatLikePreCommit(file, raw);
        assert.notStrictEqual(
          formatted,
          raw,
          `${kind}: expected prettier to change this skeleton at all — if it now doesn't, double-check ` +
            'the .prettierrc.json / prettier version is still the one this test is meant to guard against'
        );
      });

      it('formatted skeleton yields the same check.ts finding-set as the raw skeleton', async () => {
        const formatted = await formatLikePreCommit(file, raw);
        const rawFindings = await runCheckBattery(file, raw);
        const fmtFindings = await runCheckBattery(file, formatted);
        assert.deepStrictEqual(
          findingKeys(fmtFindings),
          findingKeys(rawFindings),
          `${kind}: prettier formatting changed the checker finding-set.\n` +
            `raw:       ${JSON.stringify(findingKeys(rawFindings))}\n` +
            `formatted: ${JSON.stringify(findingKeys(fmtFindings))}`
        );
      });
    });
  }
});
