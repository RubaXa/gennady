// @file: Unit tests for ARIA snapshot helpers — captureAriaSnapshot, compareAriaSnapshot, generateAriaSnapshot.
// @consumers: none (test-only)
// @tasks: TSK-114

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// #region TEST_SUITE_CAPTURE_ARIA_SNAPSHOT
describe('captureAriaSnapshot', () => {
  it('calls page.ariaSnapshot() and returns the YAML result', async () => {
    // contract: captureAriaSnapshot delegates to page.ariaSnapshot() and returns its value
    const expectedYaml = '- heading "agent-inbox"\n';

    const fakePage = {
      ariaSnapshot: mock.fn(async () => expectedYaml),
    };

    const { captureAriaSnapshot } = await import('../aria-snapshot.helper.ts');
    const result = await captureAriaSnapshot(fakePage as any);

    assert.strictEqual(result, expectedYaml);
    assert.strictEqual(fakePage.ariaSnapshot.mock.callCount(), 1);
  });

  it('returns the result unchanged — passthrough wrapper', async () => {
    // contract: function is a thin passthrough; different YAML shapes pass through
    const complexYaml = '- list "Links":\n  - listitem:\n    - link "Home"\n';

    const fakePage = {
      ariaSnapshot: mock.fn(async () => complexYaml),
    };

    const { captureAriaSnapshot } = await import('../aria-snapshot.helper.ts');
    const result = await captureAriaSnapshot(fakePage as any);

    assert.strictEqual(result, complexYaml);
  });
});
// #endregion

// #region TEST_SUITE_COMPARE_ARIA_SNAPSHOT
describe('compareAriaSnapshot', () => {
  it('exists as a callable async function accepting Page and string', async () => {
    // contract: compareAriaSnapshot is an exported function with the right signature
    const { compareAriaSnapshot } = await import('../aria-snapshot.helper.ts');
    assert.strictEqual(typeof compareAriaSnapshot, 'function');
  });

  it('calls page.locator("body") before delegating to expect().toMatchAriaSnapshot()', async () => {
    // contract: compareAriaSnapshot calls page.locator('body') then expect(...).toMatchAriaSnapshot(expected).
    // The expect() assertion requires Playwright test runner context and will throw in node:test.
    // We verify the locator delegation path — the full assertion is covered by Playwright e2e tests.
    const expectedSnapshot = '- heading "test"\n';

    const fakePage = {
      locator: mock.fn((_selector: string) => ({})),
    };

    const { compareAriaSnapshot } = await import('../aria-snapshot.helper.ts');

    try {
      await compareAriaSnapshot(fakePage as any, expectedSnapshot);
    } catch {
      // Expected — expect().toMatchAriaSnapshot() needs Playwright context.
      // The call to page.locator('body') should have happened before the throw.
    }

    // Verify page.locator was called with 'body'
    const locatorCalls = fakePage.locator.mock.calls;
    assert.ok(locatorCalls.length > 0, 'page.locator should have been called');
    assert.strictEqual(locatorCalls[0]?.arguments[0], 'body');
  });
});
// #endregion

// #region TEST_SUITE_GENERATE_ARIA_SNAPSHOT
describe('generateAriaSnapshot', () => {
  it('calls locator.ariaSnapshot() and returns the YAML result', async () => {
    // contract: generateAriaSnapshot delegates to locator.ariaSnapshot() and returns its value
    const expectedYaml = '- listitem "MR !510"\n';

    const fakeLocator = {
      ariaSnapshot: mock.fn(async () => expectedYaml),
    };

    const { generateAriaSnapshot } = await import('../aria-snapshot.helper.ts');
    const result = await generateAriaSnapshot(fakeLocator as any);

    assert.strictEqual(result, expectedYaml);
    assert.strictEqual(fakeLocator.ariaSnapshot.mock.callCount(), 1);
  });

  it('returns result from a complex nested subtree snapshot', async () => {
    // contract: passthrough for nested YAML
    const nestedYaml = '- region "reviewer":\n  - list:\n    - listitem "MR !510"\n';

    const fakeLocator = {
      ariaSnapshot: mock.fn(async () => nestedYaml),
    };

    const { generateAriaSnapshot } = await import('../aria-snapshot.helper.ts');
    const result = await generateAriaSnapshot(fakeLocator as any);

    assert.strictEqual(result, nestedYaml);
  });
});
// #endregion
