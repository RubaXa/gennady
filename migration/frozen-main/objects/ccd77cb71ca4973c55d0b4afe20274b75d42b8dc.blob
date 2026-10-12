// @file: Unit tests for review-issues cmd — resolveVcsContext interaction contract.
// @consumers: N/A
// @tasks: TSK-70

import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VcsResolveError } from '../../_shared/vcs-context-resolver.ts';
import type { VcsCliContext } from '../../_shared/vcs-context-resolver.ts';

// ── Mock delegates ───────────────────────────────────────────────────────────

const resolveVcsContextTracker = mock.fn(
  async (_args: any): Promise<VcsCliContext> => ({
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'group/repo',
    iid: 42,
    token: 'glpat-mock',
  })
);

const runReviewCommandTracker = mock.fn(async (_opts: any) => ({ code: 0 }));

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: {
    resolveVcsContext: resolveVcsContextTracker,
    VcsResolveError,
  },
});

mock.module('../_core/logic/run-review-command.logic.ts', {
  namedExports: {
    runReviewCommand: runReviewCommandTracker,
  },
});

// ── Setup before import ──────────────────────────────────────────────────────

let exitCode: number | null = null;
let stderrLines: string[];
const origExit = process.exit;
const origArgv = process.argv;
let origStderrWrite: typeof process.stderr.write;

stderrLines = [];
origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown) => {
  stderrLines.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

process.exit = ((code?: number) => {
  exitCode = code ?? 0;
  return undefined as never;
}) as typeof process.exit;

// ── Import SUT ───────────────────────────────────────────────────────────────

process.argv = ['node', 'gennady', 'group/repo!42'];
await import('../review-issues.cmd.ts');

// ── Restore ──────────────────────────────────────────────────────────────────

process.stderr.write = origStderrWrite;
process.exit = origExit;
process.argv = origArgv;

afterEach(() => {
  stderrLines.length = 0;
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
});

describe('review-issues cmd', () => {
  it('no args — resolveVcsContext with empty args, behavior unchanged', async () => {
    // contract: when process.argv has no ref/branch/project, parseReviewCommandArgs
    // produces all-undefined fields → vcsCliArgs = {} → resolveVcsContext called with {}
    // failure mode: do not silently inject defaults that change auto-detection behavior
    const { parseReviewCommandArgs } =
      await import('../_core/logic/parse-review-command-args.logic.ts');
    const args = parseReviewCommandArgs(['node', 'gennady']);
    assert.strictEqual(args.ref, undefined);
    assert.strictEqual(args.branch, undefined);
    assert.strictEqual(args.project, undefined);
    assert.strictEqual(args.iid, undefined);
  });

  it('ref passed to resolveVcsContext, VcsCliContext used', () => {
    // contract: --ref group/repo!42 → resolveVcsContext called with { ref: 'group/repo!42' }
    // failure mode: do not inspect private internals — verify only mock call args

    assert.strictEqual(resolveVcsContextTracker.mock.callCount(), 1);

    const resolveCallArgs = resolveVcsContextTracker.mock.calls[0].arguments[0];

    assert.deepStrictEqual(resolveCallArgs, {
      ref: 'group/repo!42',
      branch: undefined,
      project: undefined,
      iid: undefined,
    });

    assert.strictEqual(runReviewCommandTracker.mock.callCount(), 1);

    const reviewCallArg = runReviewCommandTracker.mock.calls[0].arguments[0];
    assert.strictEqual(reviewCallArg.mode, 'issues');
    assert.ok(
      reviewCallArg.vcsContext !== undefined,
      'vcsContext must be passed to runReviewCommand'
    );
    assert.strictEqual(reviewCallArg.vcsContext.host, 'gitlab.example.com');
    assert.strictEqual(reviewCallArg.vcsContext.project, 'group/repo');
    assert.strictEqual(reviewCallArg.vcsContext.iid, 42);
  });
});
