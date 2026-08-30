// @file: Lazy directive assembly — splits a delta-reduced directive into a slim skeleton plus one
// package per Step, and the pure helpers that guard the split (assembly-mode resolution, axiom/
// contract activation signal, version-fingerprint parity, lazy-candidacy reassessment).
// @consumers: build-directives.ts (wiring lands in a later phase of this task)
// @tasks: DA-lazy-asm

import { existsSync, readFileSync } from 'node:fs';
import { logger } from '#logger';

/* ---------- Assembly mode resolution (DA-REQ-1) ---------- */

/** @purpose The two build shapes a directive can be rendered into. */
export type AssemblyMode = 'monolith' | 'lazy';

/** @purpose Per-project assembly policy read from the assembly manifest file. */
export type AssemblyManifest = {
  /** @purpose Mode applied when a directive has no override | @invariant Falls back to 'monolith' when absent */
  defaultMode: AssemblyMode;
  /** @purpose Per-directive mode pins keyed by manifest-relative path (e.g. 'sdd-v2/audit.directive.xml') | @invariant Highest priority in resolveAssemblyMode */
  overrides: Record<string, AssemblyMode>;
};

/** @purpose Project-root-relative location of the real assembly manifest. */
export const DEFAULT_ASSEMBLY_MANIFEST_PATH = 'ai/kit/assembly-manifest.json';

const BUILTIN_DEFAULT_MODE: AssemblyMode = 'monolith';

type RawAssemblyManifest = { defaultMode?: unknown; overrides?: Record<string, unknown> };

/**
 * @purpose Resolve which mode governs one directive's build, honoring the priority chain
 *   manifest-override > cli-flag > manifest-defaultMode > built-in monolith default.
 * @invariant A missing manifest file is not an error — it resolves as `{ defaultMode: 'monolith', overrides: {} }`.
 * @param directiveManifestKey The directive's key as written under `overrides` (e.g. 'sdd-v2/audit.directive.xml').
 * @param [cliFlag] The `--assembly=<mode>` value from the current build invocation.
 * @param [manifestPath] Project-root-relative manifest path; defaults to the real one.
 * @throws {Error} Malformed manifest JSON, or an `overrides` value outside `'monolith'`/`'lazy'` —
 *   never a silent monolith fallback.
 * @returns The mode this directive's build must use.
 */
export function resolveAssemblyMode(
  directiveManifestKey: string,
  cliFlag?: AssemblyMode,
  manifestPath: string = DEFAULT_ASSEMBLY_MANIFEST_PATH
): AssemblyMode {
  const manifest = readAssemblyManifest(manifestPath);
  const override = manifest.overrides[directiveManifestKey];
  return override ?? cliFlag ?? manifest.defaultMode;
}

function readAssemblyManifest(manifestPath: string): AssemblyManifest {
  if (!existsSync(manifestPath)) {
    return { defaultMode: BUILTIN_DEFAULT_MODE, overrides: {} };
  }

  // #region START_PARSE_MANIFEST_JSON — invariant: malformed JSON must fail the build explicitly, never fall back to monolith silently
  let raw: RawAssemblyManifest;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as RawAssemblyManifest;
  } catch (cause) {
    const error = new Error(`[readAssemblyManifest] Malformed assembly manifest JSON: ${manifestPath}`, { cause });
    logger.error(`[readAssemblyManifest] [reading → failed] ${manifestPath}`, { error });
    throw error;
  }
  // #endregion END_PARSE_MANIFEST_JSON

  return {
    defaultMode: raw.defaultMode === 'lazy' ? 'lazy' : BUILTIN_DEFAULT_MODE,
    overrides: validateOverrides(raw.overrides, manifestPath),
  };
}

/**
 * @purpose Narrow every raw override value to the AssemblyMode union, rejecting anything else
 *   before it can silently defeat downstream strict-equality mode checks.
 * @param rawOverrides Unvalidated JSON-parsed override map, keyed by directive manifest key.
 * @param manifestPath Manifest file path, echoed into the thrown error for operator triage.
 * @throws {Error} An override value is neither `'monolith'` nor `'lazy'`.
 * @returns The same keys, every value narrowed to `AssemblyMode`.
 */
function validateOverrides(
  rawOverrides: Record<string, unknown> | undefined,
  manifestPath: string
): Record<string, AssemblyMode> {
  const overrides: Record<string, AssemblyMode> = {};
  for (const [key, value] of Object.entries(rawOverrides ?? {})) {
    // #region START_REJECT_INVALID_OVERRIDE_MODE — invariant: an override outside the AssemblyMode union must fail the build explicitly, never degrade to monolith by falling through the strict downstream comparison
    if (value !== 'monolith' && value !== 'lazy') {
      const error = new Error(
        `[readAssemblyManifest] Invalid assembly mode override in ${manifestPath}: overrides["${key}"] = ${JSON.stringify(value)} — expected "monolith" or "lazy"`
      );
      logger.error(`[readAssemblyManifest] [validating overrides → failed] ${manifestPath}`, { error });
      throw error;
    }
    // #endregion END_REJECT_INVALID_OVERRIDE_MODE
    overrides[key] = value;
  }
  return overrides;
}

/* ---------- Version fingerprint (DA-REQ-7, DA-REQ-8) ---------- */

/** @purpose Human-readable build version stamped into a skeleton header and every package's first line — never a hash. */
export type BuildFingerprint = string;

const HEX_HASH_SHAPE = /^[0-9a-f]{7,40}$/i;

/**
 * @purpose Validate and stamp a human-readable version as this build's fingerprint.
 * @param version The npm-style version string for this build (e.g. '0.8.4-draft.40').
 * @throws {Error} Empty input, or input shaped like a hex hash — DA-REQ-7 forbids hashes.
 * @returns The trimmed version string, unchanged otherwise.
 */
export function stampFingerprint(version: string): BuildFingerprint {
  const trimmed = version?.trim();
  if (!trimmed) {
    throw new Error('[stampFingerprint] Version string must be non-empty');
  }
  if (HEX_HASH_SHAPE.test(trimmed)) {
    throw new Error(`[stampFingerprint] Refusing hex-hash-shaped fingerprint: ${trimmed}`);
  }
  return trimmed;
}

/** @purpose One skeleton/package pair whose stamped fingerprints disagree — post-facto drift evidence for DA-REQ-8. */
export type VersionMismatch = {
  /** @purpose Name of the directive this drift was found in */
  directiveName: string;
  /** @purpose Id of the Step whose package disagrees with the skeleton */
  stepId: string;
  /** @purpose Fingerprint recorded in the skeleton's header */
  skeletonVersion: BuildFingerprint;
  /** @purpose Fingerprint recorded in the drifted package's first line */
  packageVersion: BuildFingerprint;
};

/**
 * @purpose Post-facto skeleton/package version parity check (DA-REQ-8) — mechanism A has no live check at read time.
 * @param skeleton The assembled directive's skeleton.
 * @param packages Every package produced alongside that skeleton.
 * @returns One `VersionMismatch` per package whose fingerprint disagrees with the skeleton's; empty when in sync.
 */
export function findVersionMismatches(
  skeleton: DirectiveSkeleton,
  packages: readonly StepPackage[]
): VersionMismatch[] {
  return packages
    .filter((pkg) => pkg.fingerprint !== skeleton.fingerprint)
    .map((pkg) => ({
      directiveName: skeleton.directiveName,
      stepId: pkg.stepId,
      skeletonVersion: skeleton.fingerprint,
      packageVersion: pkg.fingerprint,
    }));
}

/* ---------- Axiom / contract activation signal (DA-REQ-9) ---------- */

/** @purpose Placement verdict for one axiom or output-contract id inside an assembled directive. */
export type AxiomActivation = 'cross-cutting' | 'single-step';

/** @purpose One `<Step>` block's id and full body text, as found in the delta-reduced directive source. */
export type StepBodyEntry = {
  /** @purpose Literal `id` attribute of the `<Step>` | @invariant Matches DA-REQ-4's package filename verbatim */
  id: string;
  /** @purpose Full text between the Step's opening and closing tags */
  body: string;
};

/**
 * @purpose Classifies one axiom/contract id as cross-cutting (skeleton) or single-step (one
 *   Step's package), reusing `audit-axiom-activation.mjs`'s literal-id-in-body signal per Step.
 */
export const AxiomActivationClassifier = {
  /**
   * @invariant Zero activating steps is the safe default (cross-cutting) — logged as a YAGNI candidate, never rejected.
   * @param id Literal id of the axiom or output-contract being placed (e.g. `AX_NARROW_RECON`, `HANDOFF_FORMAT`).
   * @param steps Every Step in the directive, with its full body text.
   * @returns `single-step` only when exactly one Step's body carries `id`; `cross-cutting` otherwise.
   */
  classify(id: string, steps: readonly StepBodyEntry[]): AxiomActivation {
    const activatingStepIds = resolveActivatingStepIds(id, steps);
    if (activatingStepIds.length === 0) {
      logger.warn(`[AxiomActivationClassifier#classify] [scanning → cross-cutting] ${id} activates in zero steps`, {
        id,
        yagniCandidate: true,
      });
      return 'cross-cutting';
    }
    return activatingStepIds.length === 1 ? 'single-step' : 'cross-cutting';
  },
};

/** @purpose Convenience alias for `AxiomActivationClassifier.classify` so callers can import the bare verb. */
export const classify = AxiomActivationClassifier.classify;

function resolveActivatingStepIds(id: string, steps: readonly StepBodyEntry[]): string[] {
  const idPattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(id)}(?![A-Za-z0-9_-])`);
  return steps.filter((step) => idPattern.test(step.body)).map((step) => step.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- Lazy-candidacy reassessment (DA-REQ-16) ---------- */

/** @purpose Measured shape of one directive's BeliefState, used to decide lazy-override candidacy. */
export type LazyCandidacyMetrics = {
  /** @purpose Token count of the directive's whole BeliefState (every Axiom body combined) */
  beliefStateTokenCount: number;
  /** @purpose Share (0..1) of the directive's axioms whose AxiomActivationClassifier verdict is single-step */
  singleStepAxiomRatio: number;
};

const LAZY_CANDIDACY_TOKEN_THRESHOLD = 6000;
const LAZY_CANDIDACY_SINGLE_STEP_RATIO_THRESHOLD = 0.5;

/**
 * @purpose Decide whether a directive is a lazy-override candidate under DA-REQ-16's reassessment rule.
 * @param metrics The directive's current BeliefState size and single-step axiom ratio.
 * @returns `true` when BeliefState exceeds 6000 tokens OR the single-step axiom ratio exceeds 50%.
 */
export function isLazyCandidate(metrics: LazyCandidacyMetrics): boolean {
  return (
    metrics.beliefStateTokenCount > LAZY_CANDIDACY_TOKEN_THRESHOLD ||
    metrics.singleStepAxiomRatio > LAZY_CANDIDACY_SINGLE_STEP_RATIO_THRESHOLD
  );
}

/* ---------- Skeleton + package split (DA-REQ-3..5, DA-REQ-10, DA-REQ-13) ---------- */

/** @purpose Root-relative folder segment every lazy-assembled directive's packages share. */
const STEP_PACKAGE_NAMESPACE = 'ai/directives/sdd-v2';

/** @purpose Everything the caller must supply to split one already delta-reduced directive. */
export type LazyAssemblyInput = {
  /** @purpose Bare directive folder name (e.g. 'phase-execution-protocol') | @invariant Used verbatim in the package path, DA-REQ-4 */
  directiveName: string;
  /** @purpose Fully rendered directive text, already reduced by the delta pass (`partials_ORIGINAL - ctx`) — DA-REQ-10 */
  sourceText: string;
  /** @purpose This build's stamped fingerprint, from `stampFingerprint` */
  fingerprint: BuildFingerprint;
};

/** @purpose The slim, always-in-context half of a lazy-assembled directive. */
export type DirectiveSkeleton = {
  /** @purpose Bare directive folder name this skeleton belongs to */
  directiveName: string;
  /** @purpose This build's stamped fingerprint, identical to every sibling package's */
  fingerprint: BuildFingerprint;
  /** @purpose Mission + HaltConditions + cross-cutting axioms/contracts + step list + rebuild hint — no Step's full body */
  text: string;
};

/** @purpose One Step's externalized, read-on-demand half of a lazy-assembled directive. */
export type StepPackage = {
  /** @purpose Literal `<Step id="...">` value, unchanged — DA-REQ-4 */
  stepId: string;
  /** @purpose Project-root-relative path this package is written to and read back from */
  relativePath: string;
  /** @purpose This build's stamped fingerprint, identical to the owning skeleton's */
  fingerprint: BuildFingerprint;
  /** @purpose Fingerprint line + the Step's full original body + its single-step axioms/contracts */
  text: string;
};

/** @purpose The full output of one `LazyDirectiveAssembler.assemble` call. */
export type LazyAssemblyResult = {
  /** @purpose The always-in-context half of the split */
  skeleton: DirectiveSkeleton;
  /** @purpose One read-on-demand package per `<Step>` found in the source */
  packages: StepPackage[];
};

/**
 * @purpose Direct implementation of the LazyDirectiveAssembler service
 *   (directive-assembly.spec.md#service-lazydirectiveassembler): splits a delta-reduced directive
 *   into one skeleton and one package per `<Step>`.
 */
export const LazyDirectiveAssembler = {
  /**
   * @pre `input.sourceText` contains at least one `<Step>` block.
   * @param input The delta-reduced directive source, its bare name, and this build's fingerprint.
   * @throws {Error} Zero Steps in `sourceText` — a lazy override on a Step-less directive is a
   *   configuration error, never an empty skeleton.
   * @returns One `DirectiveSkeleton` and exactly one `StepPackage` per `<Step>`; every package
   *   carries `input.fingerprint`.
   */
  assemble(input: LazyAssemblyInput): LazyAssemblyResult {
    const steps = extractTopLevelTagBlocks(input.sourceText, 'Step');

    // #region START_REJECT_STEPLESS_LAZY_DIRECTIVE — invariant: DA-REQ-3, a lazy override on a Step-less directive is a build misconfiguration, never a silently empty skeleton
    if (steps.length === 0) {
      const error = new Error(
        `[LazyDirectiveAssembler#assemble] Directive '${input.directiveName}' has zero <Step> blocks — lazy mode requires at least one`
      );
      logger.error(`[LazyDirectiveAssembler#assemble] [splitting → failed] ${input.directiveName}`, { error });
      throw error;
    }
    // #endregion END_REJECT_STEPLESS_LAZY_DIRECTIVE

    const stepEntries: StepBodyEntry[] = steps.map((step) => ({
      id: requireStepId(step, input.directiveName),
      body: step.body,
    }));
    const stepRanges = steps.map((step) => ({ start: step.start, end: step.end }));

    // Axioms/contracts declared inside a Step's own body belong to that Step already — never
    // re-classified as a top-level, independently placeable block (defends against a future
    // template nesting one inside a Step; the pilot directives never do this today).
    const axioms = extractTopLevelTagBlocks(input.sourceText, 'Axiom').filter(
      (tag) => !isWithinAnyRange(tag.start, stepRanges)
    );
    const contracts = extractTopLevelTagBlocks(input.sourceText, 'Contract').filter(
      (tag) => !isWithinAnyRange(tag.start, stepRanges)
    );

    const singleStepAxioms = classifyBySoleStep(axioms, stepEntries);
    const singleStepContracts = classifyBySoleStep(contracts, stepEntries);

    return {
      skeleton: {
        directiveName: input.directiveName,
        fingerprint: input.fingerprint,
        text: buildSkeletonText(input, steps, singleStepAxioms, singleStepContracts),
      },
      packages: steps.map((step) => buildStepPackage(input, step, singleStepAxioms, singleStepContracts)),
    };
  },
};

/** @purpose Convenience alias for `LazyDirectiveAssembler.assemble` so callers can import the bare verb. */
export const assemble = LazyDirectiveAssembler.assemble;

/** @purpose A single-step-classified Axiom/Contract block, resolved to the one Step that owns it. */
type ClassifiedTagBlock = { id: string; ownerStepId: string; fullMatch: string; start: number; end: number };

function classifyBySoleStep(tags: readonly TagBlock[], steps: readonly StepBodyEntry[]): ClassifiedTagBlock[] {
  const owned: ClassifiedTagBlock[] = [];
  for (const tag of tags) {
    if (!tag.id) continue; // an id-less block is never step-scoped — stays in the skeleton wholesale
    const activatingStepIds = resolveActivatingStepIds(tag.id, steps);
    if (activatingStepIds.length === 1) {
      owned.push({ id: tag.id, ownerStepId: activatingStepIds[0], fullMatch: tag.fullMatch, start: tag.start, end: tag.end });
    }
  }
  return owned;
}

function buildSkeletonText(
  input: LazyAssemblyInput,
  steps: readonly TagBlock[],
  singleStepAxioms: readonly ClassifiedTagBlock[],
  singleStepContracts: readonly ClassifiedTagBlock[]
): string {
  const spans = [
    ...steps.map((step) => ({
      start: step.start,
      end: step.end,
      replacement: buildStepListEntry(step, input.directiveName),
    })),
    ...[...singleStepAxioms, ...singleStepContracts].map((tag) => ({
      start: tag.start,
      end: tag.end,
      replacement: '',
    })),
  ].sort((a, b) => a.start - b.start);

  let body = '';
  let cursor = 0;
  for (const span of spans) {
    body += input.sourceText.slice(cursor, span.start) + span.replacement;
    cursor = span.end;
  }
  body += input.sourceText.slice(cursor);

  const header = [
    input.fingerprint,
    '<!-- Step packages regenerate via: npm run build:directives -- --assembly=lazy. A missing ' +
      'file at a path below means the build or sync is stale — rebuild rather than guess. -->',
  ].join('\n');

  return `${header}\n\n${body}`;
}

function buildStepListEntry(step: TagBlock, directiveName: string): string {
  const stepId = requireStepId(step, directiveName);
  const relativePath = buildStepPackagePath(directiveName, stepId);
  const gist = extractStepGist(step.body);
  return `- **${stepId}** — ${gist} Before executing this step, READ_AND_USE_DIRECTIVE("${relativePath}").`;
}

function extractStepGist(stepBody: string): string {
  const [goalBlock] = extractTopLevelTagBlocks(stepBody, 'Goal');
  const source = goalBlock ? goalBlock.body : stepBody.replace(/<[^>]+>/g, ' ');
  const collapsed = source.replace(/\s+/g, ' ').trim();
  const firstTwoSentences = collapsed.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  return firstTwoSentences || collapsed.slice(0, 200);
}

function buildStepPackagePath(directiveName: string, stepId: string): string {
  return `${STEP_PACKAGE_NAMESPACE}/${directiveName}/steps/${stepId}.xml`;
}

function buildStepPackage(
  input: LazyAssemblyInput,
  step: TagBlock,
  singleStepAxioms: readonly ClassifiedTagBlock[],
  singleStepContracts: readonly ClassifiedTagBlock[]
): StepPackage {
  const stepId = requireStepId(step, input.directiveName);
  const ownedAxioms = singleStepAxioms.filter((axiom) => axiom.ownerStepId === stepId).map((axiom) => axiom.fullMatch);
  const ownedContracts = singleStepContracts
    .filter((contract) => contract.ownerStepId === stepId)
    .map((contract) => contract.fullMatch);

  return {
    stepId,
    relativePath: buildStepPackagePath(input.directiveName, stepId),
    fingerprint: input.fingerprint,
    text: [input.fingerprint, step.fullMatch, ...ownedAxioms, ...ownedContracts].join('\n\n'),
  };
}

function requireStepId(step: TagBlock, directiveName: string): string {
  if (!step.id) {
    throw new Error(`[LazyDirectiveAssembler#assemble] Directive '${directiveName}' has a <Step> with no id attribute`);
  }
  return step.id;
}

function isWithinAnyRange(position: number, ranges: readonly Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => position >= range.start && position < range.end);
}

/* ---------- Balanced tag scanning (shared by Step/Axiom/Contract extraction) ---------- */

/** @purpose One matched `<TagName ...>...</TagName>` (or self-closing `<TagName ... />`) block. */
type TagBlock = { id: string | null; body: string; fullMatch: string; start: number; end: number };

/**
 * @purpose Neutralize single-line backtick code spans so a quoted pseudo-tag example never
 *   perturbs real same-name tag-boundary scanning (DA-lazy-asm F-05, precedent: `parse-directive.ts`).
 * @invariant Output length matches `source` exactly — masked offsets stay valid for slicing `source`.
 */
function maskCodeSpans(source: string): string {
  return source.replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
}

/**
 * @purpose Extract every `<TagName>...</TagName>` block from `source`, tracking same-name
 *   nesting depth so a nested block never closes its ancestor early.
 * @invariant Self-closing `<TagName ... />` blocks yield an empty body.
 * @invariant Tag boundaries are located on a `maskCodeSpans`-masked copy of `source` so a quoted
 *   pseudo-tag never counts as real markup; slicing still reads unmasked `source`.
 * @param source Directive text to scan.
 * @param tagName Exact tag name to match (e.g. 'Step', 'Axiom', 'Contract').
 * @throws {Error} An opening tag with no matching close — the source is not well-formed for this tag name.
 * @returns Every matched block, in source order.
 */
function extractTopLevelTagBlocks(source: string, tagName: string): TagBlock[] {
  const openTagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g');
  const closeTagPattern = new RegExp(`</${tagName}>`, 'g');
  const blocks: TagBlock[] = [];
  const masked = maskCodeSpans(source);

  let scanFrom = 0;
  // #region START_SCAN_BALANCED_BLOCKS — invariant: same-name nesting is tracked by depth so a nested block never closes its ancestor early
  while (scanFrom < source.length) {
    openTagPattern.lastIndex = scanFrom;
    const opening = openTagPattern.exec(masked);
    if (!opening) break;

    const openStart = opening.index;
    const openText = source.slice(openStart, openStart + opening[0].length);
    if (openText.endsWith('/>')) {
      blocks.push({
        id: extractIdAttribute(openText),
        body: '',
        fullMatch: openText,
        start: openStart,
        end: openStart + openText.length,
      });
      scanFrom = openStart + openText.length;
      continue;
    }

    let depth = 1;
    let cursor = openStart + openText.length;
    let closeStart = -1;
    while (depth > 0) {
      closeTagPattern.lastIndex = cursor;
      const nextClose = closeTagPattern.exec(masked);
      if (!nextClose) {
        throw new Error(`[extractTopLevelTagBlocks] Unbalanced <${tagName}> opened at index ${openStart} — no matching close tag`);
      }

      // #region START_SKIP_SELFCLOSING_OPENS — invariant: a self-closing sibling never nests and never
      // closes the ancestor either; advance past every one of them before deciding whether a genuinely
      // nested open (non-self-closing) still precedes nextClose — otherwise the nearest self-closing
      // sibling is mistaken for real content and the ancestor is closed early (DA-lazy-asm F-01)
      openTagPattern.lastIndex = cursor;
      let nextOpen = openTagPattern.exec(masked);
      while (nextOpen !== null && nextOpen.index < nextClose.index && nextOpen[0].endsWith('/>')) {
        openTagPattern.lastIndex = nextOpen.index + nextOpen[0].length;
        nextOpen = openTagPattern.exec(masked);
      }
      // #endregion END_SKIP_SELFCLOSING_OPENS

      const nextOpenIsNested = nextOpen !== null && nextOpen.index < nextClose.index;
      if (nextOpenIsNested) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) closeStart = nextClose.index;
      }
    }

    blocks.push({
      id: extractIdAttribute(openText),
      body: source.slice(openStart + openText.length, closeStart),
      fullMatch: source.slice(openStart, cursor),
      start: openStart,
      end: cursor,
    });
    scanFrom = cursor;
  }
  // #endregion END_SCAN_BALANCED_BLOCKS

  return blocks;
}

function extractIdAttribute(openTagText: string): string | null {
  const match = /\bid="([^"]+)"/.exec(openTagText);
  return match ? match[1] : null;
}
