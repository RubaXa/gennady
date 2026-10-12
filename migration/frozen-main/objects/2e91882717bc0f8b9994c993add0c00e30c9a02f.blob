// @file: Contract tests for the universal checkable surface of testing rule files.
// @consumers: CI, testing rule maintainers, SDD audit
// @tasks: N/A

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

describe('rule checkable surface contract', () => {
  it('exposes every universal section in all previously incomplete rules', () => {
    // #region START_UNIVERSAL_SECTIONS_SETUP_RULE_FILES
    const files = [
      read('ai/directives/coding/result-conventions.xml'),
      read('ai/directives/coding/uikit-spec-drafting.xml'),
      read('ai/directives/testing/common.xml'),
      read('ai/directives/testing/node-test.xml'),
      read('ai/directives/testing/vitest-rules.xml'),
      read('plugins/golang/directives/infra/golang-setup.xml'),
    ];
    // #endregion END_UNIVERSAL_SECTIONS_SETUP_RULE_FILES

    // #region START_UNIVERSAL_SECTIONS_ASSERT_CHECKABLE_SURFACE
    for (const content of files) {
      for (const section of [
        'BeliefState',
        'AntiPatterns',
        'VerificationHooks',
        'RewardCriteria',
      ]) {
        assert.match(content, new RegExp(`<${section}>`));
        assert.match(content, new RegExp(`</${section}>`));
      }
    }
    // #endregion END_UNIVERSAL_SECTIONS_ASSERT_CHECKABLE_SURFACE
  });

  it('adds executable hooks and domain rewards instead of empty section markers', () => {
    // #region START_DOMAIN_SURFACES_SETUP_RULE_FILES
    const result = read('ai/directives/coding/result-conventions.xml');
    const uikit = read('ai/directives/coding/uikit-spec-drafting.xml');
    const vitest = read('ai/directives/testing/vitest-rules.xml');
    const golang = read('plugins/golang/directives/infra/golang-setup.xml');
    // #endregion END_DOMAIN_SURFACES_SETUP_RULE_FILES

    // #region START_DOMAIN_SURFACES_ASSERT_MEANINGFUL_CONTRACTS
    assert.match(result, /HOOK_RESULT_LINT_RULES/);
    assert.match(result, /AP_UNGUARDED_MUST_AT_BOUNDARY/);
    assert.match(uikit, /HOOK_DRAFT_REQUIRED_SECTIONS/);
    assert.match(vitest, /primary test command uses one-shot `vitest run`/);
    assert.match(golang, /HOOK_GO_VERIFY_CHANGED_SCOPE/);
    assert.match(golang, /Tool\/config\/version failures report ENV_FAIL/);
    // #endregion END_DOMAIN_SURFACES_ASSERT_MEANINGFUL_CONTRACTS
  });

  it('keeps common verification runner-neutral and node rewards runner-specific', () => {
    // #region START_RULE_RESPONSIBILITIES_SETUP_CONTENT
    const common = read('ai/directives/testing/common.xml');
    const node = read('ai/directives/testing/node-test.xml');
    // #endregion END_RULE_RESPONSIBILITIES_SETUP_CONTENT

    // #region START_RULE_RESPONSIBILITIES_ASSERT_SEPARATION
    assert.match(common, /HOOK_RUN_PROJECT_VERIFICATION/);
    assert.match(common, /Zero executed gates.*never as test success/);
    assert.match(common, /AP_ACCEPT_OUTPUT_BY_REWRITING_EXPECTATION/);
    assert.match(node, /native `mock\.fn\(\)`/);
    assert.match(node, /narrowest diagnostic `node:assert\/strict` API/);
    // #endregion END_RULE_RESPONSIBILITIES_ASSERT_SEPARATION
  });
});
