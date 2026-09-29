// @file: Public UV-14 task/phase-only sdd-verify invocation contract.
// @spec: CLI-SDD-VERIFY
// @consumers: CI

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ERR_CLI_SDD_VERIFY_BAD_INVOCATION,
  parseSddVerifyInvocation,
} from '../sdd-verify-invocation.ts';

const argv = (...rest: string[]): string[] => ['node', 'gennady.ts', 'sdd-verify', ...rest];

describe('UV-14 sdd-verify public invocation', () => {
  it('accepts only complete task/phase identity and explicit overlay provenance', () => {
    assert.deepEqual(
      parseSddVerifyInvocation(argv('--task', 'specs/app/task.md', '--phase', 'P2')),
      {
        ok: true,
        invocation: { task: 'specs/app/task.md', phase: 'P2' },
      }
    );
    assert.deepEqual(
      parseSddVerifyInvocation(
        argv(
          '--task',
          'specs/app/task.md',
          '--phase',
          'P2',
          '--legacy-overlay',
          'operator:reviewed'
        )
      ),
      {
        ok: true,
        invocation: {
          task: 'specs/app/task.md',
          phase: 'P2',
          legacyOverlay: 'operator:reviewed',
        },
      }
    );
  });

  it('rejects the removed profile/only/skip compatibility surface and bare invocation', () => {
    for (const args of [
      [],
      ['--profile', 'full'],
      ['--only', 'lint'],
      ['--skip', 'format'],
      ['--task', 'specs/app/task.md'],
      ['--phase', 'P2'],
    ]) {
      const result = parseSddVerifyInvocation(argv(...args));
      assert.equal(result.ok, false, args.join(' '));
      if (!result.ok) {
        assert.match(result.message, new RegExp(ERR_CLI_SDD_VERIFY_BAD_INVOCATION));
        assert.match(result.message, /--task <ticket-path> --phase <PhaseID>/);
      }
    }
  });

  it('does not expose a staged or dirty-tree bypass', () => {
    const result = parseSddVerifyInvocation(
      argv('--task', 'specs/app/task.md', '--phase', 'P2', '--staged')
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /staged/);
  });
});
