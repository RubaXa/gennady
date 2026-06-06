// @file: Integration tests for gennady run CLI command — thin wrapper over @services/agent-run, mocked.
// @consumers: CI
// @tasks: TSK-65

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock state ──────────────────────────────────────────────────────────────

type RunOptions = {
  task: string;
  dirs?: string[];
  model?: string;
  engine?: string;
  timeout?: number;
};

type RunResult = { text: string; engine: string };

let mockRunImpl: (opts: RunOptions) => Promise<RunResult>;

// ── Register module mock BEFORE importing SUT ────────────────────────────────

mock.module('../../../../services/agent-run/index.ts', {
  namedExports: {
    run: async (opts: RunOptions) => mockRunImpl(opts),
    AgentRunError: class AgentRunError extends Error {
      readonly code: string;
      readonly hint: string;
      constructor(code: string, hint: string) {
        super(`[AgentRunError] ${code}: ${hint}`);
        this.code = code;
        this.hint = hint;
        this.name = 'AgentRunError';
      }
    },
  },
});

// ── Import SUT after mocks are registered ───────────────────────────────────

const { runCommand } = await import('../run.cmd.ts');

// ── Helpers ──────────────────────────────────────────────────────────────────

function argv(...args: string[]): string[] {
  return ['node', 'gennady.js', 'run', ...args];
}

function captureStreams(): {
  stdout: string[];
  stderr: string[];
  restoreStdout: () => void;
  restoreStderr: () => void;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  return {
    stdout,
    stderr,
    restoreStdout: () => {
      process.stdout.write = origStdoutWrite;
    },
    restoreStderr: () => {
      process.stderr.write = origStderrWrite;
    },
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let streams: ReturnType<typeof captureStreams>;
let exitCode: number | null;
const origExit = process.exit;

beforeEach(() => {
  exitCode = null;
  streams = captureStreams();

  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw Object.assign(new Error(`process.exit(${exitCode})`), { exitCode });
  }) as typeof process.exit;
});

afterEach(() => {
  process.exit = origExit;
  streams.restoreStdout();
  streams.restoreStderr();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('run.cmd', () => {
  // #region TEST_CASE_RUN_1: happy path stdout exit 0
  it('prints text and exits 0', async () => {
    // contract: run() called with task only; stdout receives text + newline; exit 0
    // failure mode: do not include dirs/model/engine in call when not supplied

    let capturedOpts: RunOptions | null = null;
    mockRunImpl = async (opts) => {
      capturedOpts = opts;
      return { text: '# ответ', engine: 'opencode' };
    };

    try {
      await runCommand(argv('"опиши"'));
    } catch {
      /* process.exit throws */
    }

    assert.strictEqual(exitCode, 0);
    assert.match(streams.stdout.join(''), /# ответ/);
    assert.deepStrictEqual(capturedOpts, { task: '"опиши"' });
  });
  // #endregion

  // #region TEST_CASE_RUN_2: flags parsed into RunOptions
  it('parses flags into RunOptions', async () => {
    // contract: --dir×2/--model/--engine/--timeout all reach run() as typed fields

    let capturedOpts: RunOptions | null = null;
    mockRunImpl = async (opts) => {
      capturedOpts = opts;
      return { text: 'ok', engine: 'opencode' };
    };

    try {
      await runCommand(
        argv(
          't',
          '--dir',
          'a',
          '--dir',
          'b',
          '--model',
          'llm-proxy/glm-4.7',
          '--engine',
          'opencode',
          '--timeout',
          '5000'
        )
      );
    } catch {
      /* process.exit throws */
    }

    assert.strictEqual(exitCode, 0);
    assert.deepStrictEqual(capturedOpts, {
      task: 't',
      dirs: ['a', 'b'],
      model: 'llm-proxy/glm-4.7',
      engine: 'opencode',
      timeout: 5000,
    });
  });
  // #endregion

  // #region TEST_CASE_RUN_3: empty task exits 1 without calling run()
  it('errors on empty task without calling run', async () => {
    // contract: no task positional → exit 1; stderr usage message; run() never called

    let runCallCount = 0;
    mockRunImpl = async (_opts) => {
      runCallCount++;
      return { text: 'should not reach', engine: 'opencode' };
    };

    // case A: no positional at all
    try {
      await runCommand(argv());
    } catch {
      /* process.exit throws */
    }

    assert.strictEqual(exitCode, 1);
    assert.match(streams.stderr.join(''), /Usage:/);
    assert.strictEqual(runCallCount, 0);

    // reset for case B: empty string
    exitCode = null;
    streams.stdout.length = 0;
    streams.stderr.length = 0;

    try {
      await runCommand(argv(''));
    } catch {
      /* process.exit throws */
    }

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(runCallCount, 0);
  });
  // #endregion

  // #region TEST_CASE_RUN_4: AgentRunError → stderr hint+code, exit 1
  it('prints AgentRunError message+code+hint and exits 1', async () => {
    // contract: e.hint + [e.code] on stderr; e.message NOT printed; exit 1

    mockRunImpl = async (_opts) => {
      const { AgentRunError } = await import('../../../../services/agent-run/index.ts');
      throw new AgentRunError(
        'VERSION_MISMATCH',
        'CLI opencode отстал — попроси оператора brew upgrade opencode'
      );
    };

    try {
      await runCommand(argv('t'));
    } catch {
      /* process.exit throws */
    }

    const stderrOut = streams.stderr.join('');
    assert.strictEqual(exitCode, 1);
    assert.match(stderrOut, /✗/);
    assert.match(stderrOut, /CLI opencode отстал — попроси оператора brew upgrade opencode/);
    assert.match(stderrOut, /\[VERSION_MISMATCH\]/);
    // e.message = "[AgentRunError] VERSION_MISMATCH: ..." must NOT appear
    assert.strictEqual(stderrOut.includes('[AgentRunError]'), false);
  });
  // #endregion

  // #region TEST_CASE_RUN_5: MODEL_UNAVAILABLE hint with list
  it('prints model list on MODEL_UNAVAILABLE', async () => {
    // contract: hint contains model list; [MODEL_UNAVAILABLE] in stderr; exit 1

    mockRunImpl = async (_opts) => {
      const { AgentRunError } = await import('../../../../services/agent-run/index.ts');
      throw new AgentRunError(
        'MODEL_UNAVAILABLE',
        'Модель «нет/такой» недоступна. Доступные: a/b, c/d'
      );
    };

    try {
      await runCommand(argv('t', '--model', 'нет/такой'));
    } catch {
      /* process.exit throws */
    }

    const stderrOut = streams.stderr.join('');
    assert.strictEqual(exitCode, 1);
    assert.match(stderrOut, /\[MODEL_UNAVAILABLE\]/);
    assert.match(stderrOut, /a\/b, c\/d/);
  });
  // #endregion
});
