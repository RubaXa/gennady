// @file: s1-fixture — scenario S1: ready specs + ticket for tic-tac-toe → scaffold → execute → audit.
// @consumers: harness/run.ts
// @tasks: N/A (eval harness, not published)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Scenario } from '../core/harness.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @purpose Absolute path to the tic-tac-toe fixture copied into every S1 workspace. */
export const S1_FIXTURE_DIR = join(HERE, '..', 'fixtures', 'tic-tac-toe');

/**
 * @purpose Scenario S1 — the spec and ticket are already written and agreed; the flow's job is to
 *   turn the ready ticket into working, tested code (scaffold → execute → audit).
 * @invariant The pass criteria are on-disk facts: the four source/test files exist AND were authored
 *   by the agent (in the trace), `npm test` is green, and the coverage gate the ticket declares is met.
 */
export const s1Fixture: Scenario = {
  id: 's1',
  label: 'fixture',
  fixtureDir: S1_FIXTURE_DIR,
  model: 'llm-proxy/deepseek-v4-pro',
  steps: [
    {
      label: 'scaffold',
      text:
        'The repo has a ready, agreed SDD v2 spec and ticket under specs/ttt/. Using the synced ' +
        'directives in ai/directives/sdd-v2, run the SCAFFOLD phase for ticket TTT-core: confirm the ' +
        'Entity Inventory and phase plan are consistent with the spec. Do not implement yet.',
      timeoutMinutes: 20,
    },
    {
      label: 'execute',
      text:
        'Run the EXECUTE phase for ticket TTT-core end to end: implement every phase (src/game.ts, ' +
        'src/cli.ts, test/game.test.ts, test/cli.test.ts), run the verification the ticket declares, ' +
        'and only mark a phase DONE when its gate actually passes.',
      timeoutMinutes: 40,
    },
    {
      label: 'audit',
      text:
        'Run the AUDIT / code-review for ticket TTT-core against the spec and the SDD v2 audit ' +
        'directive. Report any gate that does not genuinely pass; do not close the task on an unproven gate.',
      timeoutMinutes: 20,
    },
  ],
  expect: {
    requiredFiles: ['src/game.ts', 'src/cli.ts', 'test/game.test.ts', 'test/cli.test.ts'],
    writtenFiles: ['src/game.ts', 'src/cli.ts', 'test/game.test.ts', 'test/cli.test.ts'],
    testCommand: ['npm', 'test'],
    gateCommands: [
      { name: 'coverage', cmd: ['npx', 'gennady', 'testcov', '--min=90', 'src/game.ts'] },
    ],
  },
};
