// @file: Integration tests for alt-opinion CLI command wrapper — end-to-end through run() with mocked AI providers, telemetry verification.
// @consumers: CI
// @tasks: TSK-25, TSK-26

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

type GenerateTextParams = { model: unknown; prompt: string };

const mockState = {
  generateTextCalls: [] as GenerateTextParams[],
  throwCount: 0,
  readFileCalls: [] as { path: string }[],
  createOpenAIKeyCheck: true,
};

mock.module('ai', {
  namedExports: {
    async generateText(params: GenerateTextParams) {
      mockState.generateTextCalls.push(params);
      if (mockState.throwCount > 0) {
        mockState.throwCount--;
        throw new Error('Mock model failure');
      }
      return {
        text: `Mock opinion ${mockState.generateTextCalls.length}`,
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
      };
    },
  },
});

mock.module('@ai-sdk/openai', {
  namedExports: {
    createOpenAI(config: { apiKey?: string; baseURL?: string; name?: string }) {
      if (mockState.createOpenAIKeyCheck && !config.apiKey) {
        throw new Error(
          `[createOpenAI] API key is required for provider "${config.name ?? 'unknown'}". Set the corresponding env variable.`
        );
      }
      return {
        chat: (_modelId: string) =>
          ({ modelId: _modelId, providerName: config.name }) as unknown as never,
      };
    },
  },
});

import type { AltOpinionCmdDeps } from '../alt-opinion.cmd.ts';

const { run } = await import('../alt-opinion.cmd.ts');

function argv(...args: string[]): string[] {
  return ['node', 'gennady.js', ...args];
}

function tempFilePath(): string {
  return join(tmpdir(), `alt-opinion-test-${crypto.randomUUID()}.md`);
}

function setupStdoutCapture(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    output.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return {
    output,
    restore: () => {
      process.stdout.write = originalWrite;
    },
  };
}

const ENV_KEYS = [
  'LLM_PROXY_API_KEY',
  'LLM_PROXY_BASE_URL',
  'OPENROUTER_API_KEY',
] as const;

describe('alt-opinion cmd (integration)', () => {
  let stdoutCapture: ReturnType<typeof setupStdoutCapture>;
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
  let originalIsTtyDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    stdoutCapture = setupStdoutCapture();

    originalEnv = {};
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
    process.env['LLM_PROXY_API_KEY'] = 'test-llmproxy-key';
    process.env['OPENROUTER_API_KEY'] = 'test-openrouter-key';
    delete process.env['LLM_PROXY_BASE_URL'];

    originalIsTtyDesc = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => true,
      configurable: true,
    });

    mockState.generateTextCalls = [];
    mockState.throwCount = 0;
    mockState.readFileCalls = [];
    mockState.createOpenAIKeyCheck = true;
  });

  afterEach(() => {
    stdoutCapture.restore();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
    if (originalIsTtyDesc) {
      Object.defineProperty(process.stdin, 'isTTY', originalIsTtyDesc);
    }
  });

  it('--file with existing temp file → exitCode 0, opinion block in output', async () => {
    // purpose: verify that --file with a valid file path produces opinion blocks with anchor markers
    // failure mode: file reading failure should not be conflated with model failure

    const tmpFile = tempFilePath();
    writeFileSync(tmpFile, 'Hello world', 'utf-8');

    // #region START_FILE_SUCCESS_TRIGGER
    try {
      const report = await run(
        argv(`--file=${tmpFile}`, '--model=openrouter/test-a', '--model=openrouter/test-b')
      );
      // #endregion END_FILE_SUCCESS_TRIGGER

      // #region START_FILE_SUCCESS_ASSERT
      assert.strictEqual(report.exitCode, 0);
      const out = stdoutCapture.output.join('');
      assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-TEST-A-->/);
      assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-TEST-A-->/);
      assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-TEST-B-->/);
      assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-TEST-B-->/);
      assert.match(out, /<!--TELEMETRY wall=\d+ms tokens=1\/1 reason=stop-->/);
      // #endregion END_FILE_SUCCESS_ASSERT
    } finally {
      if (!tmpFile.includes('nonexistent')) unlinkSync(tmpFile);
    }
  });

  it('--file with nonexistent path → exitCode 1, error message', async () => {
    // purpose: verify error handling when --file points to a missing path
    // contract: readFile throws ENOENT, propagated through runner

    // #region START_FILE_NOT_FOUND_TRIGGER_AND_ASSERT
    await assert.rejects(
      run(argv('--model=openrouter/test', '--file=/nonexistent/path.md')),
      (error: Error) => {
        assert.match(error.message, /ENOENT|no such file|cannot find/i);
        return true;
      }
    );
    // #endregion END_FILE_NOT_FOUND_TRIGGER_AND_ASSERT
  });

  it('stdin + --file → exitCode 1, mutually exclusive', async () => {
    // purpose: verify that stdin and --file cannot be used together per parser contract

    // #region START_STDIN_FILE_EXCLUSIVE_TRIGGER_AND_ASSERT
    await assert.rejects(
      run(argv('--model=openrouter/test', '--file=task.md'), { stdinContent: 'piped content' }),
      (error: Error) => {
        assert.match(error.message, /mutually exclusive/);
        return true;
      }
    );
    // #endregion END_STDIN_FILE_EXCLUSIVE_TRIGGER_AND_ASSERT
  });

  it('No API key → exitCode 1, message about missing key', async () => {
    // purpose: verify that missing provider API key is caught at provider creation
    // contract: createOpenAI throws when apiKey is falsy

    delete process.env['LLM_PROXY_API_KEY'];
    delete process.env['OPENROUTER_API_KEY'];

    // #region START_NO_API_KEY_TRIGGER_AND_ASSERT
    await assert.rejects(
      run(argv('--model=llmproxy/test', '--file=/tmp/fake.md'), { readFile: () => 'content' }),
      (error: Error) => {
        assert.match(error.message, /API key is required/i);
        return true;
      }
    );
    // #endregion END_NO_API_KEY_TRIGGER_AND_ASSERT
  });

  it('All models succeed → exitCode 0', async () => {
    // purpose: verify happy-path: all model ports resolve → exitCode 0

    // #region START_ALL_SUCCESS_TRIGGER
    const report = await run(argv('--model=openrouter/alpha', '--model=openrouter/beta'), {
      stdinContent: 'Analyze this content',
    });
    // #endregion END_ALL_SUCCESS_TRIGGER

    // #region START_ALL_SUCCESS_ASSERT
    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.results.length, 2);
    for (const r of report.results) {
      assert.strictEqual(r.success, true);
    }
    const out = stdoutCapture.output.join('');
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
    // #endregion END_ALL_SUCCESS_ASSERT
  });

  it('All fail without --strict → exitCode 1', async () => {
    // purpose: verify non-strict failure mode — all models fail → exitCode 1
    // contract: exitCode 1 when every model fails in non-strict mode

    mockState.throwCount = 2;

    // #region START_ALL_FAIL_NONSTRICT_TRIGGER
    const report = await run(argv('--model=openrouter/alpha', '--model=openrouter/beta'), {
      stdinContent: 'content',
    });
    // #endregion END_ALL_FAIL_NONSTRICT_TRIGGER

    // #region START_ALL_FAIL_NONSTRICT_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results.length, 2);
    for (const r of report.results) {
      assert.strictEqual(r.success, false);
    }
    // #endregion END_ALL_FAIL_NONSTRICT_ASSERT
  });

  it('1 of 3 fails with --strict → exitCode 1', async () => {
    // purpose: verify strict mode — any single model failure forces exitCode 1
    // contract: --strict must fail on first model error

    mockState.throwCount = 1;

    // #region START_PARTIAL_FAIL_STRICT_TRIGGER
    const report = await run(
      argv('--model=openrouter/a', '--model=openrouter/b', '--model=openrouter/c', '--strict'),
      { stdinContent: 'content' }
    );
    // #endregion END_PARTIAL_FAIL_STRICT_TRIGGER

    // #region START_PARTIAL_FAIL_STRICT_ASSERT
    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results.length, 3);
    const failCount = report.results.filter((r) => !r.success).length;
    assert.ok(failCount >= 1, `Expected at least 1 failure, got ${failCount}`);
    // #endregion END_PARTIAL_FAIL_STRICT_ASSERT
  });

  it('Markdown format with anchors → output matches anchor regex', async () => {
    // purpose: verify output formatting produces properly structured anchor blocks
    // contract: each model result wrapped in START/END anchor comments

    // #region START_ANCHOR_FORMAT_TRIGGER
    await run(argv('--model=openrouter/gpt', '--model=openrouter/claude'), {
      stdinContent: 'Review this',
    });
    // #endregion END_ANCHOR_FORMAT_TRIGGER

    // #region START_ANCHOR_FORMAT_ASSERT
    const out = stdoutCapture.output.join('');
    assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-GPT-->/);
    assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-GPT-->/);
    assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-CLAUDE-->/);
    assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-CLAUDE-->/);
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
    // #endregion END_ANCHOR_FORMAT_ASSERT
  });

  it('--synthModel → only synth block, no individual', async () => {
    // purpose: verify synthesis mode — output contains the synth block; no per-model anchor blocks
    // contract: when synthContent is present, individual model blocks are NOT written; synth is sanitized per NFC-08

    // #region START_SYNTH_ONLY_TRIGGER
    await run(
      argv(
        '--model=openrouter/alpha',
        '--model=openrouter/beta',
        '--synthModel=openrouter/synthesizer'
      ),
      { stdinContent: 'Content for synthesis test' }
    );
    // #endregion END_SYNTH_ONLY_TRIGGER

    // #region START_SYNTH_ONLY_ASSERT
    const out = stdoutCapture.output.join('');
    assert.match(out, /START_ALT_OPINION_SYNTH/);
    assert.match(out, /END_ALT_OPINION_SYNTH/);
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
    assert.strictEqual(/START_ALT_OPINION_OPENROUTER/.test(out), false);
    // #endregion END_SYNTH_ONLY_ASSERT
  });

  it('--modelPrompt from file → prompt passed to port', async () => {
    // purpose: verify that --modelPrompt=<path> reads the file and uses its content as the model prompt
    // contract: the prompt string passed to generateText must contain the custom prompt text

    const promptText = 'Custom review prompt for test';

    // #region START_MODEL_PROMPT_TRIGGER
    await run(argv('--model=openrouter/test', '--modelPrompt=./custom-prompt.md'), {
      stdinContent: 'content',
      readFile: (_path: string) => promptText,
    });
    // #endregion END_MODEL_PROMPT_TRIGGER

    // #region START_MODEL_PROMPT_ASSERT
    assert.ok(mockState.generateTextCalls.length >= 1, 'Expected at least one generateText call');
    const promptArg = mockState.generateTextCalls[0].prompt;
    assert.match(promptArg, /Custom review prompt for test/);
    // #endregion END_MODEL_PROMPT_ASSERT
  });

  it('Per-model :: syntax in CLI → model.promptPath resolved', async () => {
    // purpose: verify that :: in --model parses correctly into promptPath and overrides --modelPrompt
    // contract: model with ::<path> receives the promptPath; per-model prompt takes priority

    const commonPrompt = 'Common prompt';
    const perModelPrompt = 'Per-model specific prompt';

    const readFile = mock.fn((path: string) => {
      if (path === './common.md') return commonPrompt;
      if (path === './per-model.md') return perModelPrompt;
      throw new Error(`Unexpected path: ${path}`);
    });

    // #region START_PER_MODEL_SYNTAX_TRIGGER
    await run(argv('--model=openrouter/test::./per-model.md', '--modelPrompt=./common.md'), {
      stdinContent: 'content',
      readFile,
    });
    // #endregion END_PER_MODEL_SYNTAX_TRIGGER

    // #region START_PER_MODEL_SYNTAX_ASSERT
    assert.ok(mockState.generateTextCalls.length >= 1, 'Expected at least one generateText call');
    const promptArg = mockState.generateTextCalls[0].prompt;
    assert.match(promptArg, /Per-model specific prompt/);
    assert.strictEqual(/Common prompt/.test(promptArg), false);
    // #endregion END_PER_MODEL_SYNTAX_ASSERT
  });

  it('Empty stdin → error', async () => {
    // purpose: verify that an empty artifact (empty stdin) is rejected by the runner
    // contract: runAltOpinion throws when artifact resolves to an empty string

    // #region START_EMPTY_STDIN_TRIGGER_AND_ASSERT
    await assert.rejects(
      run(argv('--model=openrouter/test'), { stdinContent: '' }),
      (error: Error) => {
        assert.match(error.message, /Empty artifact/);
        return true;
      }
    );
    // #endregion END_EMPTY_STDIN_TRIGGER_AND_ASSERT
  });
});
