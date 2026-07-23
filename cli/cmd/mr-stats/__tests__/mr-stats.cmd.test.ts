// @file: Unit tests for mr-stats command — help, missing URL, stub.
// @consumers: MrStatsCommand
// @tasks: TSK-138

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

type MrStatsModule = typeof import('../mr-stats.cmd.ts');

let mod: MrStatsModule;
let origExit: typeof process.exit;
let origArgv: string[];

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'mr-stats', ...rest];
}

describe('MrStatsCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'mr-stats'];
    mod = await import('../mr-stats.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
  });

  it('mr-stats --help prints usage', async () => {
    const outcome = await mod.run(argv('--help'));
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.exitCode, 0);
    assert.match(outcome.message, /gennady mr-stats/);
    assert.match(outcome.message, /Usage/);
  });

  it('mr-stats without URL prints usage and exits 1', async () => {
    const outcome = await mod.run(argv());
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.exitCode, 1);
    assert.match(outcome.message, /Usage/);
  });

  it('mr-stats with URL prints not-implemented stub', async () => {
    const outcome = await mod.run(
      argv('https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14')
    );
    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(outcome.exitCode, 0);
    assert.match(outcome.message, /mr-stats: not implemented/);
  });
});
