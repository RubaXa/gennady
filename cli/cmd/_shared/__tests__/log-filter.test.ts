// @file: Unit tests for log-filter — error-block extraction, noise suppression, normalization.
// @consumers: vcs-job-log, vcs-pipeline
// @tasks: TSK-85

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { filterLog } from '../log-filter.ts';

const ESC = '\u001B';

/** @purpose Build a jest-style failure trace with negative-path noise in passing output. */
function jestTrace(): string {
  return [
    `${ESC}[32m✓${ESC}[39m src/app/routes.test.ts ${ESC}[2m(3 tests)${ESC}[22m 12ms`,
    '  error: Error: [settleShelfItem] Shelf file read failed',
    '    [cause]: Error: unread',
    '  cause: Error: network down',
    `${ESC}[31m❯${ESC}[39m perf/delta/apply-view-delta.bench.test.ts ${ESC}[2m(4 tests | ${ESC}[31m1 failed${ESC}[39m | 2 skipped)${ESC}[39m 1026ms`,
    `${ESC}[31m     ${ESC}[31m×${ESC}[39m append-storm N=5000 stays O(N)${ESC}[39m 458ms`,
    `${ESC}[32m✓${ESC}[39m src/ui/divider/divider.tokens.test.ts ${ESC}[2m(1 test)${ESC}[22m 10ms`,
    '',
    `${ESC}[31m⎯⎯⎯⎯⎯⎯${ESC}[39m${ESC}[1m${ESC}[41m Failed Tests 1 ${ESC}[49m${ESC}[22m${ESC}[31m⎯⎯⎯⎯⎯⎯${ESC}[39m`,
    '',
    `${ESC}[41m${ESC}[1m FAIL ${ESC}[22m${ESC}[49m perf/delta/apply-view-delta.bench.test.ts${ESC}[2m > ${ESC}[22mapplyViewDelta — cliff guards`,
    `${ESC}[31m${ESC}[1mAssertionError${ESC}[22m: expected 12.889614000000051 to be less than 12${ESC}[39m`,
    `${ESC}[36m ${ESC}[2m❯${ESC}[22m perf/delta/apply-view-delta.bench.test.ts:${ESC}[2m148:18${ESC}[22m${ESC}[39m`,
    `   ${ESC}[90m146|${ESC}[39m   // honest ≈1.2ms`,
    `   ${ESC}[90m147|${ESC}[39m   const { median } = stat(SCENARIOS.find((s) => s.name === 'append-storm'));`,
    `   ${ESC}[90m148|${ESC}[39m   ${ESC}[34mexpect${ESC}[39m(median)${ESC}[33m.${ESC}[39m${ESC}[34mtoBeLessThan${ESC}[39m(${ESC}[34m12${ESC}[39m)${ESC}[33m;${ESC}[39m`,
    `   ${ESC}[90m   |${ESC}[39m                  ${ESC}[31m^${ESC}[39m`,
    `   ${ESC}[90m149|${ESC}[39m  });`,
    '',
    `${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[31m1 failed${ESC}[39m${ESC}[22m${ESC}[2m | ${ESC}[22m${ESC}[1m${ESC}[32m544 passed${ESC}[39m${ESC}[22m`,
    '',
    'section_end:1789537660:cleanup_file_variables' +
      `ERROR: Job failed: command terminated with exit code 1`,
  ].join('\n');
}

/** @purpose Build a Playwright `toBeAttached` failure with locator details and a call log. */
function playwrightLocatorTrace(): string {
  return [
    `${ESC}[31m  2) [chromium] › e2e/messenger-app/messenger-flows.spec.ts:32:3 › M2: opening a chat renders seed history ${ESC}[39m`,
    '',
    `    Error: ${ESC}[2mexpect(${ESC}[22m${ESC}[31mlocator${ESC}[39m${ESC}[2m).${ESC}[22mtoBeAttached${ESC}[2m(${ESC}[22m${ESC}[2m)${ESC}[22m failed`,
    '',
    `    Locator: locator('[data-testid="messages-list"] .messages-list-host').first()`,
    `    Expected: attached`,
    `    Timeout: 10000ms`,
    `    Error: element(s) not found`,
    '',
    `    Call log:`,
    `    ${ESC}[2m  - Expect "toBeAttached" with timeout 10000ms${ESC}[22m`,
    `    ${ESC}[2m  - waiting for locator('[data-testid="messages-list"]').first()${ESC}[22m`,
    '',
    `    ${ESC}[90m   at ${ESC}[39m../_helpers/vkt-app.ts:20`,
    '',
    `    ${ESC}[90m 18 |${ESC}[39m ${ESC}[36mawait${ESC}[39m expect(`,
    `    ${ESC}[31m${ESC}[1m>${ESC}[22m${ESC}[39m${ESC}[90m 20 |${ESC}[39m ).toBeAttached({ timeout: 10000 });`,
    `    ${ESC}[90m     |${ESC}[39m ${ESC}[31m${ESC}[1m^${ESC}[22m${ESC}[39m`,
    `    ${ESC}[2m    at openChat (/builds/mail/messenger/e2e/_helpers/vkt-app.ts:20:4)${ESC}[22m`,
    '',
    `${ESC}[2m    ──────── LDD trail for FAILED test: M2: opening a chat renders seed history ────────${ESC}[22m`,
    `    #app: <!----><div class="layout-root">…`,
    `    ${ESC}[31m  1 failed${ESC}[39m`,
  ].join('\n');
}

/** @purpose Build a Playwright-style failure trace with a `>` code-frame gutter and attachments. */
function playwrightTrace(): string {
  return [
    `${ESC}[31m✘${ESC}[39m  ${ESC}[2m42 ${ESC}[22m${ESC}[31m[chromium] › e2e/mock-only/vme-history-nav.spec.ts:18:1 › VME-NAV${ESC}[39m ${ESC}[2m(12.6s)${ESC}[22m`,
    '',
    `${ESC}[31m  1) [chromium] › e2e/mock-only/vme-history-nav.spec.ts:18:1 › VME-NAV ${ESC}[39m`,
    '',
    `    Error: [{"code":"unexplained-row-jump","detail":"frame=60, residual=8"}]`,
    '',
    `    ${ESC}[2mexpect(${ESC}[22m${ESC}[31mreceived${ESC}[39m${ESC}[2m).${ESC}[22mtoBe${ESC}[2m(${ESC}[22m${ESC}[32mexpected${ESC}[39m${ESC}[2m)${ESC}[22m`,
    '',
    `    Expected: ${ESC}[32mtrue${ESC}[39m`,
    `    Received: ${ESC}[31mfalse${ESC}[39m`,
    '',
    `    ${ESC}[90m  67 |${ESC}[39m ${ESC}[32m'motionSource'${ESC}[39m`,
    `    ${ESC}[90m  68 |${ESC}[39m });`,
    `    ${ESC}[31m${ESC}[1m>${ESC}[22m${ESC}[39m${ESC}[90m  69 |${ESC}[39m ${ESC}[34mexpect${ESC}[39m(result.valid)${ESC}[33m.${ESC}[39m${ESC}[34mtoBe${ESC}[39m(${ESC}[36mtrue${ESC}[39m);`,
    `    ${ESC}[90m     |${ESC}[39m ${ESC}[31m${ESC}[1m^${ESC}[22m${ESC}[39m`,
    `    ${ESC}[2m    at /builds/mail/messenger/e2e/mock-only/vme-history-nav.spec.ts:69:58${ESC}[22m`,
    '',
    `    ${ESC}[2mattachment #1: ${ESC}[1mscreenshot${ESC}[22m (image/png)${ESC}[22m`,
    `    test-results/history/vme-chromium/test-failed-1.png`,
    '',
    `${ESC}[31m  1 failed${ESC}[39m`,
    `${ESC}[32m  45 passed${ESC}[39m${ESC}[2m (35.7m)${ESC}[22m`,
  ].join('\n');
}

describe('filterLog', () => {
  it('keeps the whole jest failure block with its code frame', () => {
    // contract: AssertionError → anchor; code frame and summary counts are pulled in as context
    const out = filterLog(jestTrace());

    assert.match(out, /Failed Tests 1/);
    assert.match(out, /perf\/delta\/apply-view-delta\.bench\.test\.ts > applyViewDelta/);
    assert.match(out, /AssertionError: expected 12\.889614000000051 to be less than 12/);
    assert.match(out, /148\|/);
    assert.match(out, /expect\(median\)/);
    assert.match(out, /\^/);
    assert.match(out, /Test Files\s+1 failed \| 544 passed/);
  });

  it('drops negative-path Error lines from passing tests', () => {
    // contract: bare `error: Error:` / `cause: Error:` are context, not anchors → suppressed
    const out = filterLog(jestTrace());

    assert.doesNotMatch(out, /Shelf file read failed/);
    assert.doesNotMatch(out, /network down/);
    assert.doesNotMatch(out, /\[cause\]: Error: unread/);
  });

  it('isolates a GitLab section marker glued to the failure line', () => {
    // contract: `section_end:...` glued to `ERROR:` is split so the error stays readable
    const out = filterLog(jestTrace());

    assert.match(out, /^ERROR: Job failed: command terminated with exit code 1$/m);
    assert.doesNotMatch(out, /section_end:\d+:cleanup_file_variablesERROR/);
  });

  it('keeps the full Playwright block: diff, >69| code frame, at-line and artifact path', () => {
    // contract: numbered failure anchor absorbs diff + `>`-prefixed code frame + stack + attachments
    const out = filterLog(playwrightTrace());

    assert.match(out, /1\) \[chromium\] › e2e\/mock-only\/vme-history-nav\.spec\.ts:18:1/);
    assert.match(out, /Expected: true/);
    assert.match(out, /Received: false/);
    assert.match(out, />\s+69 \|/);
    assert.match(out, /vme-history-nav\.spec\.ts:69:58/);
    assert.match(out, /test-failed-1\.png/);
    assert.match(out, /1 failed/);
    assert.match(out, /45 passed/);
  });

  it('keeps locator details and call log for a toBeAttached failure', () => {
    // contract: `Locator:`/`Timeout:`/`Call log:`/`- …` bullets are context of the numbered anchor
    const out = filterLog(playwrightLocatorTrace());

    assert.match(
      out,
      /Locator: locator\('\[data-testid="messages-list"\] \.messages-list-host'\)\.first\(\)/
    );
    assert.match(out, /Expected: attached/);
    assert.match(out, /Timeout: 10000ms/);
    assert.match(out, /Call log:/);
    assert.match(out, /- Expect "toBeAttached" with timeout 10000ms/);
    assert.match(out, /- waiting for locator/);
    assert.match(out, /> 20 \|/);
    assert.match(out, /at openChat/);
  });

  it('does not treat a "LDD trail for FAILED test" banner as a failure anchor', () => {
    // regression: a broad /Failed Tests?/i anchor wrongly matched the LDD trail banner
    const out = filterLog(playwrightLocatorTrace());

    assert.doesNotMatch(out, /LDD trail for FAILED test/);
    assert.doesNotMatch(out, /#app:/);
  });

  it('keeps only the failure block matching the test substring', () => {
    // contract: options.test narrows anchors to headings containing the substring
    const out = filterLog(playwrightLocatorTrace(), { test: 'opening a chat' });
    assert.match(out, /M2: opening a chat renders seed history/);
    assert.match(out, /Locator: locator/);

    const other = filterLog(playwrightLocatorTrace(), { test: 'rate-limit storm' });
    assert.strictEqual(other, '(no failing block matching "rate-limit storm")');
  });

  it('strips ANSI and resolves carriage-return redraws to the final frame', () => {
    // contract: `\r` progress lines keep only the last segment; ANSI never leaks
    const out = filterLog(`progress 1%\rprogress 99%\r${ESC}[31mERROR: boom${ESC}[39m`);

    assert.doesNotMatch(out, new RegExp(ESC));
    assert.doesNotMatch(out, /progress 1%/);
    assert.match(out, /ERROR: boom/);
  });

  it('falls back to weak patterns and a leading excerpt when no anchor exists', () => {
    // contract: no hard anchor → weak patterns; nothing matches → first chars + marker
    const noisy = filterLog('just some output\nnothing diagnostic here');
    assert.match(noisy, /\[no error lines\]/);

    const weak = filterLog('myprog: ERR_MODULE_NOT_FOUND: cannot find package');
    assert.match(weak, /ERR_MODULE_NOT_FOUND/);
  });
});
