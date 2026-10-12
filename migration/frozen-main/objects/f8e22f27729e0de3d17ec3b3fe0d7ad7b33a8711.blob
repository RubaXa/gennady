// @file: Shared stack-e2e suite runner — one implementation for every stack's fixture directory.
// @consumers: plugin-suite.e2e.test.ts, node.e2e.test.ts, config.e2e.test.ts
// @tasks: TSK-95

import { after, before, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { assertFixture, materializeFixture, readExpectation, runFixture } from './fixture.ts';
import { KNOWN_TOOLCHAINS, setupStackSuite, type StackE2eContext } from './setup.ts';

/** Env flag that turns a missing toolchain into a failure (infra-e2e §5). */
const STRICT_VARS = ['STACK_E2E_STRICT', 'CONFIG_E2E_STRICT'] as const;

/**
 * @purpose Declare one stack's e2e suite: discover fixtures, probe exactly what they require, run.
 * @invariant Probed toolchains are the union of the fixtures' `requires`, so a declared
 *   requirement can never go un-probed and silently skip every fixture.
 * @param suiteId Suite name, used in reporting and in the suite's artifact.
 * @param dir Absolute fixture directory — a plugin's own, or a repo-level one.
 * @sideEffect Registers node:test suites; spawns builds, installs and gate commands.
 */
export function declareStackSuite(suiteId: string, dir: string): void {
  const isE2eRun = process.env.STACK_E2E === '1';
  const strict = STRICT_VARS.some((name) => process.env[name] === '1');
  const only = process.env.STACK_E2E_FIXTURE ?? '';

  const fixtures = (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => only.length === 0 || id === only)
    .sort();

  // Read declarations up front: the probe list must cover every requirement.
  const declared = new Map(
    fixtures.map((id) => [id, readExpectation(path.join(dir, id, 'expect.yaml'))] as const)
  );
  const required = [...new Set([...declared.values()].flatMap((spec) => spec.requires))];
  const unknown = required.filter((id) => !(KNOWN_TOOLCHAINS as readonly string[]).includes(id));

  describe(`stack e2e — ${suiteId}`, { skip: !isE2eRun, concurrency: false }, () => {
    let ctx: StackE2eContext;
    const skipped: string[] = [];

    before(() => {
      if (unknown.length > 0) {
        // Silent skipping is how a suite rots; an unknown id must never look like a pass.
        throw new Error(
          `[${suiteId}] fixtures require unknown toolchain(s): ${unknown.join(', ')} — known: ${KNOWN_TOOLCHAINS.join(', ')}`
        );
      }
      ctx = setupStackSuite(suiteId, required);
      const versions = [...ctx.toolchains.values()]
        .map((tool) => `${tool.id} ${tool.available ? tool.version : '✗'}`)
        .join(' · ');
      console.info(`[${suiteId}] toolchains: ${versions || '(none required)'}`);
    });

    after(() => {
      ctx?.cleanup();
      if (skipped.length > 0) {
        console.info(`[${suiteId}] SKIPPED ${skipped.length}: ${skipped.join(', ')}`);
        console.info(`[${suiteId}] → set STACK_E2E_STRICT=1 to make missing toolchains fail`);
      }
    });

    if (fixtures.length === 0) {
      // An empty suite reporting "0 failures" is the same lie as a silent skip.
      it('has fixtures', () => {
        throw new Error(`[${suiteId}] no fixtures in ${dir} — an empty suite verifies nothing`);
      });
    }

    for (const id of fixtures) {
      it(id, () => {
        const expectation = declared.get(id)!;
        const missing = expectation.requires.filter(
          (tool) => ctx.toolchains.get(tool)?.available !== true
        );
        if (missing.length > 0) {
          if (strict) {
            throw new Error(`TOOLCHAIN_MISSING: ${missing.join(', ')} not in PATH (strict mode)`);
          }
          skipped.push(id);
          return;
        }
        const fixtureDir = materializeFixture(ctx, path.join(dir, id), expectation);
        assertFixture(runFixture(ctx, fixtureDir, expectation), expectation);
      });
    }
  });
}
