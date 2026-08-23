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
 * attaches directive identity to each finding it reports. A directive counts as lazily assembled
 * only when its sibling `<name>/steps/` directory exists (DA-REQ-4) — the three pilots
 * (audit, scaffold, phase-execution-protocol) carry that layout today; every other directive stays
 * monolithic and is skipped by the scan.
 *
 * Run: npm run check:directive-budgets
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens } from '../../shared/common/tokens.ts';

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

// #region START_CLI_SCAN_REAL_TREE — walks ai/directives/sdd-v2/** once; a directive counts as
// lazy only when its sibling <name>/steps/ directory exists (DA-REQ-4) — a single, one-shot
// caller, so this stays inline per AX_NO_PREMATURE_ABSTRACTIONS rather than a named export with
// no second production consumer yet.
if (isMain()) {
  const args = process.argv.slice(2);
  const sddV2Dir =
    args.find((a) => a.startsWith('--dir='))?.slice('--dir='.length) ??
    join(fileURLToPath(new URL('../..', import.meta.url)), 'ai/directives/sdd-v2');

  const LIMIT_KIND_LABEL: Record<StepBudgetFinding['limitKind'], string> = {
    'skeleton-tokens-target': 'skeleton tokens (soft target)',
    'skeleton-tokens': 'skeleton tokens (hard limit)',
    'package-chars': 'package chars (hard limit)',
    'package-line-chars': 'package line chars (hard limit)',
  };

  let hasErrorFindings = false;
  let hasWarningFindings = false;
  for (const entry of readdirSync(sddV2Dir)) {
    if (!entry.endsWith('.directive.xml')) continue;

    const directive = basename(entry, '.directive.xml');
    const stepsDir = join(sddV2Dir, directive, 'steps');
    if (!existsSync(stepsDir)) continue; // not lazily assembled yet — nothing to measure

    const skeletonText = readFileSync(join(sddV2Dir, entry), 'utf8');
    const packages: StepPackageInput[] = readdirSync(stepsDir)
      .filter((step) => step.endsWith('.xml'))
      .map((step) => ({ stepId: basename(step, '.xml'), text: readFileSync(join(stepsDir, step), 'utf8') }));

    for (const finding of check(skeletonText, packages)) {
      const artifactLabel = finding.artifact === 'skeleton' ? 'skeleton' : `step ${finding.artifact}`;
      const label = LIMIT_KIND_LABEL[finding.limitKind];
      if (finding.severity === 'error') {
        hasErrorFindings = true;
        console.error(
          `✗ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — build fails`,
        );
      } else {
        hasWarningFindings = true;
        console.error(
          `⚠ ${directive} (${artifactLabel}): ${label} = ${finding.actual} exceeds ${finding.limit} by ${finding.overage} — soft target, build still succeeds`,
        );
      }
    }
  }

  if (hasErrorFindings) {
    process.exit(1);
  }
  console.log(
    hasWarningFindings
      ? '✓ every lazy directive under ai/directives/sdd-v2/** is within its hard limit (see soft-target warning(s) above).'
      : '✓ every lazy directive under ai/directives/sdd-v2/** is within budget.',
  );
  process.exit(0);
}
// #endregion END_CLI_SCAN_REAL_TREE
