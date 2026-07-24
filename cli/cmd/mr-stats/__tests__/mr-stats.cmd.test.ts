// @file: Unit tests for mr-stats command — help, missing URL, stub.
// @consumers: MrStatsCommand
// @tasks: TSK-138, TSK-154

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

type MrStatsModule = typeof import('../mr-stats.cmd.ts');
type LineCounterModule = typeof import('../../../../services/mr-stats/line-counter.ts');

let mod: MrStatsModule;
let origExit: typeof process.exit;
let origArgv: string[];
let origToken: string | undefined;

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'mr-stats', ...rest];
}

describe('MrStatsCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    origToken = process.env.GITLAB_PERSONAL_TOKEN;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'mr-stats'];
    // deterministic token regardless of operator's real env — resolveVcsContext
    // only reads it, never contacts the network for the URL-based path.
    process.env.GITLAB_PERSONAL_TOKEN = 'test-token';

    // seam: isToolAvailable('glab') genuinely touches the OS (`which glab`) with
    // no injection point in mr-stats.cmd.ts — mocked per AX_MOCK_AS_LAST_RESORT
    // to force the deterministic "glab: command not found" early-exit and keep
    // the URL case hermetic (no live glab/network calls beyond this gate).
    const lineCounterUrl = new URL('../../../../services/mr-stats/line-counter.ts', import.meta.url)
      .href;
    const realLineCounter: LineCounterModule = await import(lineCounterUrl);
    mock.module(lineCounterUrl, {
      namedExports: {
        ...realLineCounter,
        isToolAvailable: async () => false,
      },
    });

    mod = await import('../mr-stats.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    process.env.GITLAB_PERSONAL_TOKEN = origToken;
    mock.reset();
  });

  it('mr-stats --help prints usage', async () => {
    const outcome = await mod.run(argv('--help'));
    assert.strictEqual(outcome.ok, false);
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

  it('mr-stats with URL exits early when glab is unavailable', async () => {
    // contract: real pipeline (d76451e) gates on `isToolAvailable('glab')` before any
    // network/worktree work — mocked seam makes this deterministic and hermetic.
    const outcome = await mod.run(
      argv('https://gitlab.corp.mail.ru/mail/messenger/-/merge_requests/14')
    );
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.exitCode, 2);
    assert.match(outcome.message, /glab: command not found/);
  });
});
