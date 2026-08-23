// @file: Mechanical token/char budget gate for lazy-assembled directive skeletons and step packages.
// @consumers: CI pipeline (npm run check:directive-budgets)
// @tasks: DA-lazy-asm

/**
 * DA-REQ-6/14: an assembled lazy skeleton must stay within a hard 8000-token ceiling, and every
 * generated step package within 8000 characters with no single line over 2000 characters — the
 * budgets this module measures mechanically instead of leaving them a manual-review convention
 * (DA-DL-5, DA-DL-14: line length is the real truncation risk on either host, not overall file
 * size).
 *
 * `check()` is a pure measurement over already-assembled text: it takes no directive identity,
 * only the skeleton text and its packages. The CLI entry point below (modeled on
 * `ai/kit/check-directives-fresh.ts`) is what walks the real `ai/directives/sdd-v2/**` tree and
 * attaches directive identity to each finding it reports. A directive counts as lazily assembled
 * only when its sibling `<name>/steps/` directory exists (DA-REQ-4) — no lazy directive exists yet
 * in this tree, so the CLI gate is trivially clean until `build:directives -- --assembly=lazy`
 * starts producing that layout for a pilot.
 *
 * Run: npm run check:directive-budgets
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens } from '../../shared/common/tokens.ts';

/** @purpose Hard token ceiling for one assembled lazy skeleton (DA-REQ-6). */
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

/** @purpose One exceeded budget: the artifact, which limit, the configured limit, and the measured overage. */
export type StepBudgetFinding = {
  /** @purpose `'skeleton'` for the skeleton itself, or the offending package's `stepId` */
  artifact: string;
  /** @purpose Which of the three budgets was exceeded */
  limitKind: 'skeleton-tokens' | 'package-chars' | 'package-line-chars';
  /** @purpose Configured limit for `limitKind` */
  limit: number;
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
      limit: SKELETON_TOKEN_LIMIT,
      overage: skeletonTokens - SKELETON_TOKEN_LIMIT,
    });
  }

  for (const pkg of packages) {
    if (pkg.text.length > PACKAGE_CHAR_LIMIT) {
      findings.push({
        artifact: pkg.stepId,
        limitKind: 'package-chars',
        limit: PACKAGE_CHAR_LIMIT,
        overage: pkg.text.length - PACKAGE_CHAR_LIMIT,
      });
    }

    const longestLine = pkg.text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
    if (longestLine > PACKAGE_LINE_CHAR_LIMIT) {
      findings.push({
        artifact: pkg.stepId,
        limitKind: 'package-line-chars',
        limit: PACKAGE_LINE_CHAR_LIMIT,
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

  let hasFindings = false;
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
      hasFindings = true;
      const artifactLabel = finding.artifact === 'skeleton' ? 'skeleton' : `step ${finding.artifact}`;
      console.error(
        `✗ ${directive} (${artifactLabel}): ${finding.limitKind} exceeds ${finding.limit} by ${finding.overage}`,
      );
    }
  }

  if (hasFindings) {
    process.exit(1);
  }
  console.log('✓ every lazy directive under ai/directives/sdd-v2/** is within budget.');
  process.exit(0);
}
// #endregion END_CLI_SCAN_REAL_TREE
