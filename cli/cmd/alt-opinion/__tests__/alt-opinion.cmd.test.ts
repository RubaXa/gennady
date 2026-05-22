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

function createMockGenerateText() {
  return async (params: GenerateTextParams) => {
    mockState.generateTextCalls.push(params);
    if (mockState.throwCount > 0) {
      mockState.throwCount--;
      throw new Error('Mock model failure');
    }
    return {
      text: `Mock opinion ${mockState.generateTextCalls.length}`,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop' as const,
    };
  };
}

function createMockCreateOpenAI() {
  return (config: { apiKey?: string; baseURL?: string; name?: string }) => {
    if (mockState.createOpenAIKeyCheck && !config.apiKey) {
      throw new Error(
        `[createOpenAI] API key is required for provider "${config.name ?? 'unknown'}". Set the corresponding env variable.`
      );
    }
    return {
      chat: (_modelId: string) =>
        ({ modelId: _modelId, providerName: config.name }) as unknown as never,
    };
  };
}

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

function mockDeps(overrides?: Partial<AltOpinionCmdDeps>): AltOpinionCmdDeps {
  return {
    generateText: createMockGenerateText(),
    createOpenAI: createMockCreateOpenAI(),
    ...overrides,
  };
}

const ENV_KEYS = ['LLM_PROXY_API_KEY', 'LLM_PROXY_BASE_URL', 'OPENROUTER_API_KEY'] as const;

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
    const tmpFile = tempFilePath();
    writeFileSync(tmpFile, 'Hello world', 'utf-8');

    try {
      const report = await run(
        argv(`--file=${tmpFile}`, '--model=openrouter/test-a', '--model=openrouter/test-b'),
        mockDeps()
      );

      assert.strictEqual(report.exitCode, 0);
      const out = stdoutCapture.output.join('');
      assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-TEST-A-->/);
      assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-TEST-A-->/);
      assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-TEST-B-->/);
      assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-TEST-B-->/);
      assert.match(out, /<!--TELEMETRY wall=\d+ms tokens=1\/1 reason=stop-->/);
    } finally {
      if (!tmpFile.includes('nonexistent')) unlinkSync(tmpFile);
    }
  });

  it('--file with nonexistent path → exitCode 1, error message', async () => {
    await assert.rejects(
      run(argv('--model=openrouter/test', '--file=/nonexistent/path.md'), mockDeps()),
      (error: Error) => {
        assert.match(error.message, /ENOENT|no such file|cannot find/i);
        return true;
      }
    );
  });

  it('stdin + --file → exitCode 1, mutually exclusive', async () => {
    await assert.rejects(
      run(argv('--model=openrouter/test', '--file=task.md'), {
        ...mockDeps(),
        stdinContent: 'piped content',
      }),
      (error: Error) => {
        assert.match(error.message, /mutually exclusive/);
        return true;
      }
    );
  });

  it('No API key → exitCode 1, message about missing key', async () => {
    delete process.env['LLM_PROXY_API_KEY'];
    delete process.env['OPENROUTER_API_KEY'];

    await assert.rejects(
      run(argv('--model=llmproxy/test', '--file=/tmp/fake.md'), {
        ...mockDeps(),
        readFile: () => 'content',
      }),
      (error: Error) => {
        assert.match(error.message, /API key is required/i);
        return true;
      }
    );
  });

  it('All models succeed → exitCode 0', async () => {
    const report = await run(argv('--model=openrouter/alpha', '--model=openrouter/beta'), {
      ...mockDeps(),
      stdinContent: 'Analyze this content',
    });

    assert.strictEqual(report.exitCode, 0);
    assert.strictEqual(report.results.length, 2);
    for (const r of report.results) {
      assert.strictEqual(r.success, true);
    }
    const out = stdoutCapture.output.join('');
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
  });

  it('All fail without --strict → exitCode 1', async () => {
    mockState.throwCount = 2;

    const report = await run(argv('--model=openrouter/alpha', '--model=openrouter/beta'), {
      ...mockDeps(),
      stdinContent: 'content',
    });

    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results.length, 2);
    for (const r of report.results) {
      assert.strictEqual(r.success, false);
    }
  });

  it('1 of 3 fails with --strict → exitCode 1', async () => {
    mockState.throwCount = 1;

    const report = await run(
      argv('--model=openrouter/a', '--model=openrouter/b', '--model=openrouter/c', '--strict'),
      { ...mockDeps(), stdinContent: 'content' }
    );

    assert.strictEqual(report.exitCode, 1);
    assert.strictEqual(report.results.length, 3);
    const failCount = report.results.filter((r) => !r.success).length;
    assert.ok(failCount >= 1, `Expected at least 1 failure, got ${failCount}`);
  });

  it('Markdown format with anchors → output matches anchor regex', async () => {
    await run(argv('--model=openrouter/gpt', '--model=openrouter/claude'), {
      ...mockDeps(),
      stdinContent: 'Review this',
    });

    const out = stdoutCapture.output.join('');
    assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-GPT-->/);
    assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-GPT-->/);
    assert.match(out, /<!--START_ALT_OPINION_OPENROUTER-CLAUDE-->/);
    assert.match(out, /<!--END_ALT_OPINION_OPENROUTER-CLAUDE-->/);
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
  });

  it('--synthModel → only synth block, no individual', async () => {
    await run(
      argv(
        '--model=openrouter/alpha',
        '--model=openrouter/beta',
        '--synthModel=openrouter/synthesizer'
      ),
      { ...mockDeps(), stdinContent: 'Content for synthesis test' }
    );

    const out = stdoutCapture.output.join('');
    assert.match(out, /START_ALT_OPINION_SYNTH/);
    assert.match(out, /END_ALT_OPINION_SYNTH/);
    assert.match(out, /<!--TELEMETRY wall=\d+ms/);
    assert.strictEqual(/START_ALT_OPINION_OPENROUTER/.test(out), false);
  });

  it('--modelPrompt from file → prompt passed to port', async () => {
    const promptText = 'Custom review prompt for test';

    await run(argv('--model=openrouter/test', '--modelPrompt=./custom-prompt.md'), {
      ...mockDeps(),
      stdinContent: 'content',
      readFile: (_path: string) => promptText,
    });

    assert.ok(mockState.generateTextCalls.length >= 1, 'Expected at least one generateText call');
    const promptArg = mockState.generateTextCalls[0].prompt;
    assert.match(promptArg, /Custom review prompt for test/);
  });

  it('Per-model :: syntax in CLI → model.promptPath resolved', async () => {
    const commonPrompt = 'Common prompt';
    const perModelPrompt = 'Per-model specific prompt';

    const readFile = mock.fn((path: string) => {
      if (path === './common.md') return commonPrompt;
      if (path === './per-model.md') return perModelPrompt;
      throw new Error(`Unexpected path: ${path}`);
    });

    await run(argv('--model=openrouter/test::./per-model.md', '--modelPrompt=./common.md'), {
      ...mockDeps(),
      stdinContent: 'content',
      readFile,
    });

    assert.ok(mockState.generateTextCalls.length >= 1, 'Expected at least one generateText call');
    const promptArg = mockState.generateTextCalls[0].prompt;
    assert.match(promptArg, /Per-model specific prompt/);
    assert.strictEqual(/Common prompt/.test(promptArg), false);
  });

  it('Empty stdin → error', async () => {
    await assert.rejects(
      run(argv('--model=openrouter/test'), { ...mockDeps(), stdinContent: '' }),
      (error: Error) => {
        assert.match(error.message, /No input provided/);
        return true;
      }
    );
  });
});
