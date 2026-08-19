// @file: Golang stack e2e suite — runs every fixtures/golang/* declaration against a real toolchain.
// @consumers: CI
// @tasks: TSK-95

import { after, before, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { assertFixture, materializeFixture, readExpectation, runFixture } from './fixture.ts';
import { setupStackSuite, type StackE2eContext } from './setup.ts';

// Gated like cli/e2e: default `npm test` discovery must not build and pack the package.
const IS_E2E = process.env.STACK_E2E === '1';
const STRICT = process.env.STACK_E2E_STRICT === '1';
const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'golang');
const ONLY = process.env.STACK_E2E_FIXTURE ?? '';

const ids = fs.existsSync(FIXTURES)
  ? fs
      .readdirSync(FIXTURES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((id) => ONLY.length === 0 || id === ONLY)
      .sort()
  : [];

describe('stack e2e — golang', { skip: !IS_E2E, concurrency: false }, () => {
  let ctx: StackE2eContext;
  const skipped: string[] = [];

  before(() => {
    ctx = setupStackSuite('golang', ['go', 'golangci-lint']);
    const versions = [...ctx.toolchains.values()]
      .map((tool) => `${tool.id} ${tool.available ? tool.version : '✗'}`)
      .join(' · ');
    console.info(`[golang] toolchains: ${versions}`);
  });

  after(() => {
    ctx?.cleanup();
    if (skipped.length > 0) {
      console.info(`[golang] skipped: ${skipped.join(', ')}`);
      console.info('[golang] → STACK_E2E_STRICT=1 turns missing toolchains into failures');
    }
  });

  for (const id of ids) {
    it(id, () => {
      const template = path.join(FIXTURES, id);
      const expectation = readExpectation(path.join(template, 'expect.yaml'));
      const missing = expectation.requires.filter(
        (tool) => ctx.toolchains.get(tool)?.available !== true
      );
      if (missing.length > 0) {
        if (STRICT) {
          throw new Error(`TOOLCHAIN_MISSING: ${missing.join(', ')} not in PATH (strict mode)`);
        }
        skipped.push(id);
        return;
      }
      const dir = materializeFixture(ctx, template, expectation);
      assertFixture(runFixture(ctx, dir, expectation), expectation);
    });
  }
});
