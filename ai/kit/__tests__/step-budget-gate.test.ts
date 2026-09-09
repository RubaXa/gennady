// @file: StepBudgetGate tests — the pure `check()` measurement against the skeleton-token,
//         package-char, and package-line-char budgets (DA-REQ-6/14), plus the
//         `check:directive-budgets` CLI wrapper that scans a real directory tree and reports.
// @consumers: node:test runner
// @tasks: DA-lazy-asm

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  check,
  SKELETON_TOKEN_TARGET,
  SKELETON_TOKEN_LIMIT,
  PACKAGE_CHAR_LIMIT,
  PACKAGE_LINE_CHAR_LIMIT,
  MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST,
  type StepPackageInput,
} from '../step-budget-gate.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'ai/kit/step-budget-gate.ts');

/**
 * Builds package text that lands exactly `overBy` characters past `PACKAGE_CHAR_LIMIT`, while
 * keeping every individual line far under `PACKAGE_LINE_CHAR_LIMIT` — isolates the package-chars
 * finding from the package-line-chars finding regardless of where either limit is currently set.
 */
function buildOversizedPackageText(overBy: number): string {
  const lineWidth = 100; // stays well under PACKAGE_LINE_CHAR_LIMIT
  const targetLength = PACKAGE_CHAR_LIMIT + overBy;
  const blockCount = Math.ceil(targetLength / (lineWidth + 1)) + 1;
  const pattern = ('x'.repeat(lineWidth) + '\n').repeat(blockCount);
  return pattern.slice(0, targetLength);
}

describe('StepBudgetGate', () => {
  describe('check', () => {
    it('returns an empty finding list when the skeleton and every package are within budget', () => {
      const packages: StepPackageInput[] = [{ stepId: 'STEP_A', text: 'short package text' }];

      assert.deepStrictEqual(check('skeleton within budget', packages), []);
    });

    it('finds a skeleton exceeding the 8000-token hard cap and names the directive and the overage', () => {
      // #region START_SKELETON_OVER_CAP_SETUP_FIXTURE
      // Each 'w' is one whitespace-separated token per countTokens — tokenCount words yields
      // exactly tokenCount tokens, pushed 50 past the hard cap.
      const tokenCount = SKELETON_TOKEN_LIMIT + 50;
      const skeletonText = Array(tokenCount).fill('w').join(' ');
      // #endregion END_SKELETON_OVER_CAP_SETUP_FIXTURE

      assert.deepStrictEqual(check(skeletonText, []), [
        {
          artifact: 'skeleton',
          limitKind: 'skeleton-tokens',
          severity: 'error',
          limit: SKELETON_TOKEN_LIMIT,
          actual: tokenCount,
          overage: 50,
        },
      ]);
    });

    it('finds a skeleton exceeding the 6000-token soft target (but under the hard cap) and reports it as a warning, not an error', () => {
      // #region START_SKELETON_OVER_TARGET_UNDER_CAP_SETUP_FIXTURE
      // Pushed 9 tokens past the target (mirrors the real phase-execution-protocol overage the
      // review found: 6009 measured against a declared ≤6000 target) while staying far under the
      // 8000-token hard cap, so only the target finding — never the hard-limit one — can fire.
      const tokenCount = SKELETON_TOKEN_TARGET + 9;
      const skeletonText = Array(tokenCount).fill('w').join(' ');
      // #endregion END_SKELETON_OVER_TARGET_UNDER_CAP_SETUP_FIXTURE

      assert.deepStrictEqual(check(skeletonText, []), [
        {
          artifact: 'skeleton',
          limitKind: 'skeleton-tokens-target',
          severity: 'warning',
          limit: SKELETON_TOKEN_TARGET,
          actual: tokenCount,
          overage: 9,
        },
      ]);
    });

    it('reports only the hard-limit error, not the soft-target warning, when a skeleton exceeds both', () => {
      // #region START_SKELETON_OVER_BOTH_SETUP_FIXTURE
      // Exceeds SKELETON_TOKEN_LIMIT (which is itself above SKELETON_TOKEN_TARGET) — the two
      // branches in check() are mutually exclusive by construction, so this asserts there is no
      // double-reporting of the same skeleton under both severities.
      const tokenCount = SKELETON_TOKEN_LIMIT + 50;
      const skeletonText = Array(tokenCount).fill('w').join(' ');
      // #endregion END_SKELETON_OVER_BOTH_SETUP_FIXTURE

      const findings = check(skeletonText, []);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].limitKind, 'skeleton-tokens');
      assert.equal(findings[0].severity, 'error');
    });

    it('finds a step package exceeding the package character cap and names the directive, the step, and the overage', () => {
      // #region START_PACKAGE_OVER_CHAR_CAP_SETUP_FIXTURE
      // Built one past PACKAGE_CHAR_LIMIT, in short lines well under the line cap — isolates the
      // package-chars finding from package-line-chars regardless of where either limit is set.
      const text = buildOversizedPackageText(1);
      const packages: StepPackageInput[] = [{ stepId: 'STEP_LONG', text }];
      // #endregion END_PACKAGE_OVER_CHAR_CAP_SETUP_FIXTURE

      assert.deepStrictEqual(check('', packages), [
        {
          artifact: 'STEP_LONG',
          limitKind: 'package-chars',
          severity: 'error',
          limit: PACKAGE_CHAR_LIMIT,
          actual: text.length,
          overage: text.length - PACKAGE_CHAR_LIMIT,
        },
      ]);
    });

    it('finds a package line exceeding 2000 characters and names the directive, the step, and the overage', () => {
      // #region START_PACKAGE_LINE_OVER_CAP_SETUP_FIXTURE
      // A single 2100-char line: well under the 8000-char package cap, so only the line-length
      // finding can fire.
      const text = 'y'.repeat(PACKAGE_LINE_CHAR_LIMIT + 100);
      const packages: StepPackageInput[] = [{ stepId: 'STEP_WIDE', text }];
      // #endregion END_PACKAGE_LINE_OVER_CAP_SETUP_FIXTURE

      assert.deepStrictEqual(check('', packages), [
        {
          artifact: 'STEP_WIDE',
          limitKind: 'package-line-chars',
          severity: 'error',
          limit: PACKAGE_LINE_CHAR_LIMIT,
          actual: text.length,
          overage: text.length - PACKAGE_LINE_CHAR_LIMIT,
        },
      ]);
    });
  });

  describe('CLI (check:directive-budgets)', () => {
    it('exits 1 and prints every violation when a generated directive exceeds a budget', () => {
      // #region START_CLI_OVER_BUDGET_SETUP_FIXTURE_TREE
      // A scratch tree outside the repo, shaped like ai/directives/sdd-v2/**: one directive file
      // plus its sibling steps/ dir (DA-REQ-4) — the CLI only treats a directive as lazily
      // assembled when that sibling dir exists.
      const fixture = mkdtempSync(join(tmpdir(), 'gennady-budget-fixture-'));
      const stepsDir = join(fixture, 'foo', 'steps');
      mkdirSync(stepsDir, { recursive: true });
      writeFileSync(join(fixture, 'foo.directive.xml'), 'skeleton within budget');
      const packageText = buildOversizedPackageText(1);
      writeFileSync(join(stepsDir, 'STEP_BIG.xml'), packageText);
      // #endregion END_CLI_OVER_BUDGET_SETUP_FIXTURE_TREE

      try {
        const result = spawnSync(
          process.execPath,
          ['--experimental-strip-types', CLI_ENTRY, `--dir=${fixture}`],
          { encoding: 'utf8' },
        );

        // #region START_CLI_OVER_BUDGET_ASSERT_EXIT_AND_MESSAGE
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          new RegExp(
            `✗ foo \\(step STEP_BIG\\): package chars \\(hard limit\\) = ${packageText.length} exceeds ${PACKAGE_CHAR_LIMIT} by ${packageText.length - PACKAGE_CHAR_LIMIT} — build fails`,
          ),
        );
        // #endregion END_CLI_OVER_BUDGET_ASSERT_EXIT_AND_MESSAGE
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('exits 0 and prints a warning (not an error) when a skeleton exceeds only the soft token target', () => {
      // #region START_CLI_OVER_TARGET_UNDER_CAP_SETUP_FIXTURE_TREE
      // Same fixture shape as the error case above, but the skeleton is sized to clear the soft
      // 6000-token target while staying under the 8000-token hard cap — the build must still
      // succeed (exit 0), with the overage surfaced only as a warning.
      const fixture = mkdtempSync(join(tmpdir(), 'gennady-budget-fixture-'));
      const stepsDir = join(fixture, 'bar', 'steps');
      mkdirSync(stepsDir, { recursive: true });
      const tokenCount = SKELETON_TOKEN_TARGET + 9;
      writeFileSync(join(fixture, 'bar.directive.xml'), Array(tokenCount).fill('w').join(' '));
      writeFileSync(join(stepsDir, 'STEP_ONE.xml'), 'short package text');
      // #endregion END_CLI_OVER_TARGET_UNDER_CAP_SETUP_FIXTURE_TREE

      try {
        const result = spawnSync(
          process.execPath,
          ['--experimental-strip-types', CLI_ENTRY, `--dir=${fixture}`],
          { encoding: 'utf8' },
        );

        // #region START_CLI_OVER_TARGET_ASSERT_EXIT_AND_MESSAGE
        assert.equal(result.status, 0);
        assert.match(
          result.stderr,
          new RegExp(
            `⚠ bar \\(skeleton\\): skeleton tokens \\(soft target\\) = ${tokenCount} exceeds ${SKELETON_TOKEN_TARGET} by 9 — soft target, build still succeeds`,
          ),
        );
        assert.match(result.stdout, /within its hard limit \(see soft-target warning\(s\) above\)/);
        // #endregion END_CLI_OVER_TARGET_ASSERT_EXIT_AND_MESSAGE
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('measures a monolithic directive with no steps/ dir at all instead of skipping it (T-B6-10b)', () => {
      // #region START_CLI_MONOLITH_MEASURED_SETUP_FIXTURE_TREE
      // No sibling steps/ dir for this directive — before T-B6-10b the scan skipped it entirely
      // (`if (!existsSync(stepsDir)) continue`), so a monolith over the hard cap never surfaced.
      const fixture = mkdtempSync(join(tmpdir(), 'gennady-budget-fixture-'));
      const tokenCount = SKELETON_TOKEN_LIMIT + 50;
      writeFileSync(join(fixture, 'baz.directive.xml'), Array(tokenCount).fill('w').join(' '));
      // #endregion END_CLI_MONOLITH_MEASURED_SETUP_FIXTURE_TREE

      try {
        const result = spawnSync(
          process.execPath,
          ['--experimental-strip-types', CLI_ENTRY, `--dir=${fixture}`],
          { encoding: 'utf8' },
        );

        // #region START_CLI_MONOLITH_MEASURED_ASSERT_FIFTH_MONOLITH_FAILS
        // "baz" is not on MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST — a monolith outside the allowlist
        // that exceeds the hard limit still fails the build, exactly like a lazy one would. This is
        // the both-way half of the allowlist test: it proves the waiver is a named exception, not a
        // blanket "monoliths never fail" rule.
        assert.ok(!MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST.includes('baz'));
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          new RegExp(`✗ baz \\(skeleton\\): skeleton tokens \\(hard limit\\) = ${tokenCount} exceeds ${SKELETON_TOKEN_LIMIT} by 50 — build fails`),
        );
        // #endregion END_CLI_MONOLITH_MEASURED_ASSERT_FIFTH_MONOLITH_FAILS
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('warns instead of failing when an allowlisted monolith exceeds the hard limit, naming T-B6-10a as owner (T-B6-10b)', () => {
      // #region START_CLI_WAIVED_MONOLITH_SETUP_FIXTURE_TREE
      // Uses a real allowlisted name so the test exercises the actual production allowlist, not a
      // stand-in — MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST is a named, shrink-only list (T-B6-10a owns
      // removing entries as each is lazy-split), never a general "monolith" exemption.
      const waivedName = MONOLITH_HARD_LIMIT_WAIVER_ALLOWLIST[0];
      const fixture = mkdtempSync(join(tmpdir(), 'gennady-budget-fixture-'));
      const tokenCount = SKELETON_TOKEN_LIMIT + 50;
      writeFileSync(join(fixture, `${waivedName}.directive.xml`), Array(tokenCount).fill('w').join(' '));
      // #endregion END_CLI_WAIVED_MONOLITH_SETUP_FIXTURE_TREE

      try {
        const result = spawnSync(
          process.execPath,
          ['--experimental-strip-types', CLI_ENTRY, `--dir=${fixture}`],
          { encoding: 'utf8' },
        );

        // #region START_CLI_WAIVED_MONOLITH_ASSERT_WARNS_NOT_FAILS
        assert.equal(result.status, 0);
        assert.match(
          result.stderr,
          new RegExp(
            `⚠ ${waivedName} \\(skeleton\\): skeleton tokens \\(hard limit\\) = ${tokenCount} exceeds ${SKELETON_TOKEN_LIMIT} by 50 — allowlisted monolith pending lazy-split \\(owner: T-B6-10a\\)`,
          ),
        );
        assert.doesNotMatch(result.stderr, new RegExp(`✗ ${waivedName}`));
        // #endregion END_CLI_WAIVED_MONOLITH_ASSERT_WARNS_NOT_FAILS
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });
});
