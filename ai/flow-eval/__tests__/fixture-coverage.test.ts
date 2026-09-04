// @file: Locks that every SDD eval fixture can satisfy the required coverage gate offline.
// @consumers: ai/flow-eval/provision
// @tasks: N/A

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE_FILES } from '../provision.ts';

// The scaffold's coverage policy is `required` for every fixture, so execute must be able to
// produce coverage offline and pass `gennady testcov <src>`. Two regressions this pins:
//   1. c8 absent from the fixture — `npm run test:coverage` then cannot write coverage-final.json
//      (chain8: the gate was structurally unsatisfiable offline).
//   2. a glob token inside the package.json `test:coverage` script — the phase receipt fingerprints
//      every path token in verification scripts and rejects globs (shared/common/repo-path.ts's
//      GLOB_META), so `sdd-verify` fails (chain9). A `.mjs` wrapper keeps the script one exact-file
//      token, which is why coverage runs through scripts/test-coverage.mjs, not an inline c8 line.
const GLOB_META = /[*?[\]{}]/;

describe('SDD eval fixtures can satisfy the required coverage gate', () => {
  for (const [fixture, files] of Object.entries(FIXTURE_FILES)) {
    it(`${fixture} declares c8 and a fingerprint-safe coverage runner`, () => {
      const raw = files['package.json'];
      assert.ok(raw, `${fixture} must ship a package.json`);
      const pkg = JSON.parse(raw) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      // (1) coverage is producible offline: c8 declared + the wrapper it invokes is shipped.
      assert.ok(
        pkg.devDependencies?.['c8'],
        `${fixture} must declare c8 so coverage is producible`
      );
      assert.ok(
        files['scripts/test-coverage.mjs'],
        `${fixture} must ship the scripts/test-coverage.mjs coverage runner`
      );

      // (2) the verification script is receipt-fingerprint-safe: no glob path tokens.
      const coverageScript = pkg.scripts?.['test:coverage'];
      assert.ok(coverageScript, `${fixture} must define a test:coverage script`);
      assert.ok(
        !GLOB_META.test(coverageScript),
        `${fixture} test:coverage must carry no glob token (sdd-verify rejects them): ${coverageScript}`
      );
    });
  }
});
