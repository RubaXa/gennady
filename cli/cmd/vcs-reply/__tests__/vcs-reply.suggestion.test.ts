// @file: Unit tests for vcs-reply suggestion field and suggestionRange block composition.
// @consumers: N/A
// @tasks: TSK-79

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { VcsCliContext } from '../../_shared/vcs-context-resolver.ts';
import type { VcsDiscussionPosition } from '../../../services/vcs-client/abstract/vcs-client-merge-discussions.ts';

// ── Module-level mock for resolveVcsContext (needed for top-level import) ──

const resolveVcsContextTracker = mock.fn(
  async (_args: any): Promise<VcsCliContext> => ({
    provider: 'gitlab',
    host: 'gitlab.example.com',
    project: 'g/p',
    iid: 42,
    token: 'glpat-mock',
  })
);

mock.module('../../_shared/vcs-context-resolver.ts', {
  namedExports: { resolveVcsContext: resolveVcsContextTracker },
});

// ── Suppress module-level side effects during import ─────────────────────

Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

let _exitCode: number | null = null;
const _origExit = process.exit;
process.exit = ((code?: number) => {
  _exitCode = code ?? 0;
  return undefined as never;
}) as typeof process.exit;

let _importStderr: string[] = [];
const _realStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown) => {
  _importStderr.push(String(chunk));
  return true;
}) as typeof process.stderr.write;

const _origArgv = process.argv;
process.argv = ['node', 'gennady', 'vcs-reply', '--project=g/p', '--iid=42'];

const cmdModule = await import('../vcs-reply.cmd.ts');
const { main } = cmdModule;

process.stderr.write = _realStderrWrite;
process.exit = _origExit;
process.argv = _origArgv;

// ── Output capture helpers ───────────────────────────────────────────────

let stderrLines: string[];
let stdoutLines: string[];
let _origStderrWrite: typeof process.stderr.write;
let _origStdoutWrite: typeof process.stdout.write;

function captureOutput(): void {
  stderrLines = [];
  stdoutLines = [];
  _origStderrWrite = process.stderr.write.bind(process.stderr);
  _origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stderr.write = ((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    stdoutLines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
}

function restoreOutput(): void {
  process.stderr.write = _origStderrWrite;
  process.stdout.write = _origStdoutWrite;
}

// ── Minimal valid diff position for suggestion tests ─────────────────────

const pos: VcsDiscussionPosition = {
  baseSha: 'base',
  startSha: 'start',
  headSha: 'head',
  newPath: 'src/file.ts',
  newLine: 42,
};

// ── BDD: suggestion + position → suggestion:-0+0 block ───────────────────

describe('vcs-reply suggestion', () => {
  it('should compose suggestion:-0+0 block from suggestion text with default range', async () => {
    // contract: suggestion + position → ```suggestion:-0+0\n<text>\n``` block in composed body
    // failure mode: do NOT lose the closing ``` fence

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [
        { discussionId: 'd1', body: 'reply', suggestion: 'improved code', position: pos },
      ],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.ok, true);

    const joined = stdoutLines.join('');
    assert.match(joined, /suggestion:-0\+0/);
    assert.match(joined, /improved code/);
  });

  // ── BDD: suggestionRange {above:1, below:2} → suggestion:-1+2 ──────────

  it('should compose suggestion:-A+B block from custom suggestionRange', async () => {
    // contract: suggestionRange {above:1, below:2} → ```suggestion:-1+2

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [
        {
          discussionId: 'd1',
          body: 'reply',
          suggestion: 'code',
          position: pos,
          suggestionRange: { above: 1, below: 2 },
        },
      ],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /suggestion:-1\+2/);
  });

  // ── BDD: suggestion + body → block appended ────────────────────────────

  it('should append suggestion block to body when both present', async () => {
    // contract: suggestion + body → body text first, suggestion block appended after newline
    // invariant: body text preserved, suggestion block follows

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ discussionId: 'd1', body: 'main text', suggestion: 'fix', position: pos }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /main text/);
    assert.match(joined, /suggestion:/);
  });

  // ── BDD: --dry-run shows final body with suggestion block ──────────────

  it('should show suggestion block in dry-run output', async () => {
    // contract: --dry-run displays the resolved body including the suggestion block

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ body: 'comment', suggestion: 'suggested diff', position: pos }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /DRY/);
    assert.match(joined, /suggested diff/);
    assert.match(joined, /suggestion:-0\+0/);
  });

  // ── Boundary: suggestion without body → block is entire body ───────────

  it('should use suggestion block as sole body when no body text', async () => {
    // contract: suggestion without body → composed body is only the suggestion block
    // invariant: no empty body line before the block

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ suggestion: 'sole content', position: pos }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 0);
    const joined = stdoutLines.join('');
    assert.match(joined, /suggestion:-0\+0/);
    assert.match(joined, /sole content/);
  });

  // ── Error: suggestion without position → validation error ──────────────

  it('should reject suggestion without position', async () => {
    // contract: suggestion without position → validation error, exit 1

    captureOutput();

    const result = await main({
      project: 'g/p',
      iid: '42',
      dryRun: true,
      stdinJsonArray: [{ body: 'reply', suggestion: 'code' }],
    });

    restoreOutput();

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.ok, false);

    const joined = stderrLines.join('');
    assert.match(joined, /suggestion требует position/);
  });
});
