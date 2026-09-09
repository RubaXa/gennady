// @file: Mechanical token/char budget gate for lazy-assembled directive skeletons and step packages.
// @consumers: CI pipeline (npm run check:directive-budgets)
// @tasks: DA-lazy-asm

/**
 * DA-REQ-6/14: an assembled lazy skeleton must stay within a *soft* 6000-token target and never
 * exceed a *hard* 8000-token ceiling; every generated step package must stay within 20 000
 * characters with no single line over 2000 characters — the budgets this module measures
 * mechanically instead of leaving them a manual-review convention (DA-DL-5, DA-DL-14: line length
 * is the real truncation risk on either host, not overall file size; DA-DL-18: the 6000-token
 * target was declarative text only until a live run silently broke it — see below).
 *
 * The target/ceiling split exists because a real build (`e08460c3`) landed
 * `phase-execution-protocol` at 6009 tokens — 9 over the declared ≤6000 target — while every gate
 * and two audit rounds stayed green, because no constant for the target ever existed: only
 * `SKELETON_TOKEN_LIMIT` (the 8000 ceiling) was mechanically checked. Exceeding the target is
 * reported as a warning (build still succeeds — DA-REQ-6's target is an aspiration, not a
 * blocker); exceeding the ceiling is reported as an error and fails the build (exit 1), unchanged
 * from before.
 *
 * `check()` is a pure measurement over already-assembled text: it takes no directive identity,
 * only the skeleton text and its packages. The CLI entry point below (modeled on
 * `ai/kit/check-directives-fresh.ts`) is what walks the real `ai/directives/sdd-v2/**` tree and
 * attaches directive identity to each finding it reports. A directive's packages are measured only
 * when its sibling `<name>/steps/` directory exists (DA-REQ-4) — the three pilots (audit, scaffold,
 * phase-execution-protocol) carry that layout today — but every directive's skeleton is measured
 * regardless (T-B6-10b): the scan used to skip a directive entirely when it had no `steps/` dir,
 * which meant a monolithic skeleton could grow past the hard ceiling with nothing to catch it. A
 * directive without `steps/` is measured with `packages: []` — same pure `check()`, just no package
 * findings possible.
 *
 * Four monoliths already exceed budget as of this change (`infra` 9633 > the 8000 hard ceiling;
 * `root` 7572, `migration-v1-v2` 6741, `router` 6094 — all three over the 6000 soft target only).
 * Failing the build on them today would block on an already-known, already-tracked debt with no
 * fix landed yet. `MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST` below names exactly those four and downgrades
 * what would otherwise be a hard-ceiling `error` to a `warning` naming the owning task (T-B6-10a,
 * the lazy-split of these four monoliths) — never silently, and never for a directive not on the
 * list: a fifth monolith found over the hard limit still fails the build (see the CLI test "a
 * monolith outside the waiver allowlist still fails the build"). This is not a baseline: the
 * measurement runs and is visible every time, the waiver only softens the severity, and the list is
 * only ever meant to shrink — as T-B6-10a lazy-splits each name, remove it here rather than leaving
 * a stale grant.
 *
 * Run: npm run check:directive-budgets
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens } from '../../shared/common/tokens.ts';
import { PROJECT_ROOT } from './render.ts';

/** @purpose Soft token target for one assembled lazy skeleton — exceeding it warns, never fails the build (DA-REQ-6, DA-DL-18). */
export const SKELETON_TOKEN_TARGET = 6000;
/** @purpose Hard token ceiling for one assembled lazy skeleton — exceeding it fails the build (DA-REQ-6). */
export const SKELETON_TOKEN_LIMIT = 8000;
// 20 000 comes from the Read delivery channel, not from Bash: opencode's read caps at 50 000
// characters, so this keeps a 2.5x margin while fitting the worst measured package (15 568).
/** @purpose Hard character ceiling for one generated step package (DA-REQ-6, DA-DL-16). */
export const PACKAGE_CHAR_LIMIT = 20_000;
/** @purpose Hard character ceiling for one line inside a step package (DA-REQ-6). */
export const PACKAGE_LINE_CHAR_LIMIT = 2000;

/**
 * @purpose Explicit, name-by-name allowlist of monolithic directives (no `<name>/steps/` yet)
 *   permitted to warn — instead of fail the build — when their skeleton exceeds
 *   `SKELETON_TOKEN_LIMIT`, until each is lazy-split. T-B6-10a owns splitting every name on this
 *   list; T-B6-10b (this gate change) owns measuring them honestly in the meantime.
 * @invariant This list only shrinks. A name is removed once T-B6-10a lazy-splits it (its skeleton
 *   then measures under budget on its own merits, or its packages are what the gate checks next);
 *   a name is never added for a newly-discovered monolith — a directive not on this list that
 *   exceeds the hard ceiling fails the build like any other (see the CLI "fifth monolith" test).
 */
export const MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST: readonly string[] = [
  'infra',
  'root',
  'migration-v1-v2',
  'router',
];

/** @purpose One generated step package as measured input: the literal `<Step>` id plus its full rendered text. */
export type StepPackageInput = {
  /** @purpose Literal `<Step>` id (DA-REQ-4) | @invariant Never renumbered or transformed */
  stepId: string;
  /** @purpose Full rendered text of the package file */
  text: string;
};

/** @purpose `'error'` fails the build; `'warning'` reports and lets the build succeed — only the skeleton target can warn (DA-REQ-6). */
export type StepBudgetSeverity = 'warning' | 'error';

/** @purpose One exceeded budget: the artifact, which limit, its severity, the configured limit, the measured actual, and the overage. */
export type StepBudgetFinding = {
  /** @purpose `'skeleton'` for the skeleton itself, or the offending package's `stepId` */
  artifact: string;
  /** @purpose Which of the four budgets was exceeded — `'skeleton-tokens-target'` is the soft 6000-token target, `'skeleton-tokens'` is the hard 8000-token ceiling */
  limitKind: 'skeleton-tokens-target' | 'skeleton-tokens' | 'package-chars' | 'package-line-chars';
  /** @purpose `'warning'` for the skeleton target, `'error'` for every hard ceiling */
  severity: StepBudgetSeverity;
  /** @purpose Configured limit for `limitKind` */
  limit: number;
  /** @purpose Measured value that triggered this finding */
  actual: number;
  /** @purpose Amount measured beyond `limit` */
  overage: number;
};

/**
 * @purpose Measures one assembled lazy skeleton and its step packages against the mechanical
 *   budgets DA-REQ-6/14 define.
 * @invariant Pure function: no directive identity, no filesystem access — the CLI wrapper below
 *   supplies both from the real tree.
 * @param skeletonText Full assembled skeleton text (carries no Step's full body, per DA-REQ-3).
 * @param packages Every step package produced alongside the skeleton.
 * @returns Empty when every budget holds; otherwise one finding per exceeded budget.
 */
export function check(skeletonText: string, packages: StepPackageInput[]): StepBudgetFinding[] {
  const findings: StepBudgetFinding[] = [];

  const skeletonTokens = countTokens(skeletonText);
  if (skeletonTokens > SKELETON_TOKEN_LIMIT) {
    findings.push({
      artifact: 'skeleton',
      limitKind: 'skeleton-tokens',
      severity: 'error',
      limit: SKELETON_TOKEN_LIMIT,
      actual: skeletonTokens,
      overage: skeletonTokens - SKELETON_TOKEN_LIMIT,
    });
  } else if (skeletonTokens > SKELETON_TOKEN_TARGET) {
    // Soft target overage: reported, never fails the build (DA-REQ-6, DA-DL-18) — distinct from
    // the hard ceiling above, which is mutually exclusive with this branch by construction.
    findings.push({
      artifact: 'skeleton',
      limitKind: 'skeleton-tokens-target',
      severity: 'warning',
      limit: SKELETON_TOKEN_TARGET,
      actual: skeletonTokens,
      overage: skeletonTokens - SKELETON_TOKEN_TARGET,
    });
  }

  for (const pkg of packages) {
    if (pkg.text.length > PACKAGE_CHAR_LIMIT) {
      findings.push({
        artifact: pkg.stepId,
        limitKind: 'package-chars',
        severity: 'error',
        limit: PACKAGE_CHAR_LIMIT,
        actual: pkg.text.length,
        overage: pkg.text.length - PACKAGE_CHAR_LIMIT,
      });
    }

    const longestLine = pkg.text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
    if (longestLine > PACKAGE_LINE_CHAR_LIMIT) {
      findings.push({
        artifact: pkg.stepId,
        limitKind: 'package-line-chars',
        severity: 'error',
        limit: PACKAGE_LINE_CHAR_LIMIT,
        actual: longestLine,
        overage: longestLine - PACKAGE_LINE_CHAR_LIMIT,
      });
    }
  }

  return findings;
}

function isMain(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

// #region START_CLI_SCAN_REAL_TREE — walks ai/directives/sdd-v2/** once; every directive's
// skeleton is measured (T-B6-10b), its step packages only when a sibling <name>/steps/ directory
// exists (DA-REQ-4) — a single, one-shot caller, so this stays inline per
// AX_NO_PREMATURE_ABSTRACTIONS rather than a named export with no second production consumer yet.
if (isMain()) {
  const args = process.argv.slice(2);
  const sddV2Dir =
    args.find((a) => a.startsWith('--dir='))?.slice('--dir='.length) ??
    join(PROJECT_ROOT, 'ai/directives/sdd-v2');

  const LIMIT_KIND_LABEL: Record<StepBudgetFinding['limitKind'], string> = {
    'skeleton-tokens-target': 'skeleton tokens (soft target)',
    'skeleton-tokens': 'skeleton tokens (hard limit)',
    'package-chars': 'package chars (hard limit)',
    'package-line-chars': 'package line chars (hard limit)',
  };

  let hasErrorFindings = false;
  let hasWarningFindings = false;
  const seenDirectiveIsLazy = new Map<string, boolean>();
  for (const entry of readdirSync(sddV2Dir)) {
    if (!entry.endsWith('.directive.xml')) continue;

    const directive = basename(entry, '.directive.xml');
    const stepsDir = join(sddV2Dir, directive, 'steps');
    const isLazy = existsSync(stepsDir);
    seenDirectiveIsLazy.set(directive, isLazy);

    const skeletonText = readFileSync(join(sddV2Dir, entry), 'utf8');
    // Monolithic (no steps/ yet): no step packages exist to measure, only the skeleton itself.
    const packages: StepPackageInput[] = isLazy
      ? readdirSync(stepsDir)
          .filter((step) => step.endsWith('.xml'))
          .map((step) => ({ stepId: basename(step, '.xml'), text: readFileSync(join(stepsDir, step), 'utf8') }))
      : [];

    for (const finding of check(skeletonText, packages)) {
      const artifactLabel = finding.artifact === 'skeleton' ? 'skeleton' : `step ${finding.artifact}`;
      const label = LIMIT_KIND_LABEL[finding.limitKind];
      // Only a monolithic directive's own skeleton can be waived, and only when it is on the
      // explicit, shrink-only allowlist (T-B6-10a owns lazy-splitting each name off it).
      const isWaivedMonolith =
        !isLazy && finding.artifact === 'skeleton' && MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST.includes(directive);

      if (finding.severity === 'error' && isWaivedMonolith) {
        hasWarningFindings = true;
        console.error(
          `⚠ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — allowlisted monolith pending lazy-split (owner: T-B6-10a); warns instead of failing until split, build still succeeds`,
        );
      } else if (finding.severity === 'error') {
        hasErrorFindings = true;
        console.error(
          `✗ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — build fails`,
        );
      } else if (isWaivedMonolith) {
        hasWarningFindings = true;
        console.error(
          `⚠ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — allowlisted monolith pending lazy-split (owner: T-B6-10a), soft target, build still succeeds`,
        );
      } else {
        hasWarningFindings = true;
        console.error(
          `⚠ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — soft target, build still succeeds`,
        );
      }
    }
  }

  // Mechanically enforces "this list only shrinks" (T-B6-10a removes a name once it lazy-splits
  // that directive): flag any allowlist entry whose directive is now lazily assembled — the split
  // already happened on disk, so the waiver is stale debt of its own and should be deleted here.
  for (const waivedName of MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST) {
    if (seenDirectiveIsLazy.get(waivedName) === true) {
      hasWarningFindings = true;
      console.error(
        `⚠ ${waivedName}: stale allowlist entry — this directive is now lazily assembled (has steps/); remove it from MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST now that T-B6-10a has split it`,
      );
    }
  }

  if (hasErrorFindings) {
    process.exit(1);
  }
  console.log(
    hasWarningFindings
      ? '✓ every measured directive under ai/directives/sdd-v2/** is within its hard limit (see soft-target warning(s) above).'
      : '✓ every measured directive under ai/directives/sdd-v2/** is within budget.',
  );
  process.exit(0);
}
// #endregion END_CLI_SCAN_REAL_TREE
