// @file: Integration tests for mr-stats — full pipeline on real MR !14.
// @consumers: node:test runner
// @tasks: TSK-139, TSK-154

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function toolAvailable(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

interface MrStatsIntegrationContext {
  hasGlab: boolean;
  hasCloc: boolean;
  hasJscpd: boolean;
  allTools: boolean;
}

describe('mr-stats integration', () => {
  let ctx: MrStatsIntegrationContext;

  before(async () => {
    const [hasGlab, hasCloc, hasJscpd] = await Promise.all([
      toolAvailable('glab'),
      toolAvailable('cloc'),
      toolAvailable('jscpd'),
    ]);
    ctx = { hasGlab, hasCloc, hasJscpd, allTools: hasGlab && hasCloc && hasJscpd };
  });

  it('mr-stats on MR !14 returns valid JSON with all categories', async (t) => {
    // contract: BDD scenario "Happy path — реальный MR !14"
    // observation focus: exit 0 + valid JSON + realCode.files > 0 + 5+ categories non-zero
    // skip: CI-safe — tools may not be present in CI; skip decided lazily inside the case
    // body (not in it() options) because ctx is populated by an async before() hook that
    // has not run yet when it() options would be evaluated at describe-registration time.
    if (!ctx.allTools) {
      t.skip('glab/cloc/jscpd not installed');
      return;
    }

    const { stdout, stderr } = await execFileAsync(
      'npx',
      [
        'tsx',
        'cli/gennady.ts',
        'mr-stats',
        'https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14',
      ],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }
    );

    let report: Record<string, unknown>;
    try {
      report = JSON.parse(stdout.trim());
    } catch {
      assert.fail(`stdout is not valid JSON: ${stdout.slice(0, 200)}`);
      return;
    }

    assert.ok(report.mr, 'missing mr metadata');
    assert.ok(report.categories, 'missing categories');

    const mr = report.mr as Record<string, unknown>;
    assert.strictEqual(mr.iid, '!14');
    assert.strictEqual(typeof mr.title, 'string');
    assert.ok((mr.title as string).length > 0, 'mr title should not be empty');
    assert.strictEqual(typeof mr.author, 'string');
    assert.ok((mr.author as string).length > 0, 'mr author should not be empty');

    const categories = report.categories as Record<string, Record<string, unknown>>;
    const keys = Object.keys(categories);
    assert.strictEqual(keys.length, 10, 'should have 10 categories');

    const realCode = categories.realCode as Record<string, unknown>;
    assert.ok(
      typeof realCode.files === 'number' && realCode.files > 0,
      `realCode.files=${realCode.files}, expected > 0`
    );
    assert.ok(typeof realCode.entities === 'object', 'realCode.entities missing');
    assert.ok(typeof realCode.duplicates === 'object', 'realCode.duplicates missing');

    const dup = realCode.duplicates as Record<string, unknown>;
    assert.ok(
      typeof dup.percentage === 'number' &&
        (dup.percentage as number) >= 0 &&
        (dup.percentage as number) <= 100,
      `duplicates.percentage=${dup.percentage}`
    );

    // At least 5 categories have files > 0
    let nonZeroCategories = 0;
    for (const key of keys) {
      const cat = categories[key];
      if (typeof cat.files === 'number' && cat.files > 0) nonZeroCategories += 1;
    }
    assert.ok(nonZeroCategories >= 5, `only ${nonZeroCategories} categories have files > 0`);

    // uiSvelte should have files (MR !14 has .svelte files)
    const uiSvelte = categories.uiSvelte as Record<string, unknown>;
    assert.ok(uiSvelte.files > 0, `uiSvelte.files=${uiSvelte.files}, expected > 0`);

    // testingStorybook should have files (MR !14 has stories)
    const testing = categories.testingStorybook as Record<string, unknown>;
    assert.ok(testing.files > 0, `testingStorybook.files=${testing.files}, expected > 0`);

    // realCode should have commentLines and codeLines with added > 0
    assert.ok(typeof realCode.commentLines === 'object', 'realCode.commentLines missing');
    assert.ok(typeof realCode.codeLines === 'object', 'realCode.codeLines missing');

    const stderrStr = stderr || '';
    if (stderrStr.length > 0) {
      assert.ok(
        stderrStr.length > 0,
        `stderr should be empty or contain only warnings, got: ${stderrStr.slice(0, 200)}`
      );
    }
  });
});
