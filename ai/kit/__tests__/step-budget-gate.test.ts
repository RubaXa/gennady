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
  SKELETON_TOKEN_LIMIT,
  PACKAGE_CHAR_LIMIT,
  PACKAGE_LINE_CHAR_LIMIT,
  type StepPackageInput,
} from '../step-budget-gate.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'ai/kit/step-budget-gate.ts');

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
        { artifact: 'skeleton', limitKind: 'skeleton-tokens', limit: SKELETON_TOKEN_LIMIT, overage: 50 },
      ]);
    });

    it('finds a step package exceeding 8000 characters and names the directive, the step, and the overage', () => {
      // #region START_PACKAGE_OVER_CHAR_CAP_SETUP_FIXTURE
      // 90 lines of 90 chars each stay well under the 2000-char line cap while pushing the whole
      // package past the 8000-char cap — isolates the package-chars finding from package-line-chars.
      const text = Array.from({ length: 90 }, () => 'x'.repeat(90)).join('\n');
      const packages: StepPackageInput[] = [{ stepId: 'STEP_LONG', text }];
      // #endregion END_PACKAGE_OVER_CHAR_CAP_SETUP_FIXTURE

      assert.deepStrictEqual(check('', packages), [
        {
          artifact: 'STEP_LONG',
          limitKind: 'package-chars',
          limit: PACKAGE_CHAR_LIMIT,
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
          limit: PACKAGE_LINE_CHAR_LIMIT,
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
      const packageText = Array.from({ length: 90 }, () => 'x'.repeat(90)).join('\n');
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
            `foo \\(step STEP_BIG\\): package-chars exceeds ${PACKAGE_CHAR_LIMIT} by ${packageText.length - PACKAGE_CHAR_LIMIT}`,
          ),
        );
        // #endregion END_CLI_OVER_BUDGET_ASSERT_EXIT_AND_MESSAGE
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });
});
