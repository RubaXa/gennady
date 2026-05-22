// @file: Unit tests for alt-opinion CLI argument parser.
// @consumers: Developers, CI
// @tasks: TSK-23, TSK-25

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseAltOpinionArgs } from '../alt-opinion-parser.ts';

function argv(...args: string[]): string[] {
  return ['node', 'gennady.js', ...args];
}

describe('parseAltOpinionArgs', () => {
  let originalIsTtyDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalIsTtyDesc = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalIsTtyDesc) {
      Object.defineProperty(process.stdin, 'isTTY', originalIsTtyDesc);
    }
  });

  it('should parse --model with provider/model', () => {
    const result = parseAltOpinionArgs(argv('--model=llmproxy/deepseek-v4-pro', '--file=test.md'));
    assert.deepStrictEqual(result.models[0], {
      provider: 'llmproxy',
      model: 'deepseek-v4-pro',
      promptPath: undefined,
    });
  });

  it('should parse --model with per-model prompt via :: syntax', () => {
    const result = parseAltOpinionArgs(
      argv('--model=llmproxy/gpt-4o::./custom.md', '--file=test.md')
    );
    assert.deepStrictEqual(result.models[0], {
      provider: 'llmproxy',
      model: 'gpt-4o',
      promptPath: './custom.md',
    });
  });

  it('should accumulate repeated --model flags into an array', () => {
    const result = parseAltOpinionArgs(
      argv('--model=llmproxy/a', '--model=openrouter/b', '--model=llmproxy/c', '--file=test.md')
    );
    assert.strictEqual(result.models.length, 3);
    assert.deepStrictEqual(result.models[0], {
      provider: 'llmproxy',
      model: 'a',
      promptPath: undefined,
    });
    assert.deepStrictEqual(result.models[1], {
      provider: 'openrouter',
      model: 'b',
      promptPath: undefined,
    });
    assert.deepStrictEqual(result.models[2], {
      provider: 'llmproxy',
      model: 'c',
      promptPath: undefined,
    });
  });

  it('should throw for unknown provider', () => {
    assert.throws(
      () => parseAltOpinionArgs(argv('--model=unknown/xyz', '--file=test.md')),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Unknown provider "unknown"/);
        assert.match(error.message, /llmproxy, openrouter/);
        return true;
      }
    );
  });

  it('should throw when --model has no provider (missing /)', () => {
    assert.throws(
      () => parseAltOpinionArgs(argv('--model=gpt-4o', '--file=test.md')),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /must be "provider\/model"/);
        return true;
      }
    );
  });

  it('should parse --synthModel correctly', () => {
    const result = parseAltOpinionArgs(
      argv('--model=llmproxy/gpt', '--synthModel=openrouter/claude-3', '--file=test.md')
    );
    assert.deepStrictEqual(result.synthModel, {
      provider: 'openrouter',
      model: 'claude-3',
      promptPath: undefined,
    });
  });

  it('should throw when --file and stdin are both provided', () => {
    assert.throws(
      () =>
        parseAltOpinionArgs(argv('--model=llmproxy/gpt', '--file=task.md'), {
          stdinContent: 'pipe content',
        }),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /mutually exclusive/);
        return true;
      }
    );
  });

  it('should set strict to true when --strict flag is present', () => {
    const result = parseAltOpinionArgs(argv('--model=llmproxy/gpt', '--strict', '--file=test.md'));
    assert.strictEqual(result.strict, true);
  });

  it('should parse --modelPrompt and --synthPrompt paths', () => {
    const result = parseAltOpinionArgs(
      argv('--model=llmproxy/gpt', '--modelPrompt=./m.md', '--synthPrompt=./s.md', '--file=test.md')
    );
    assert.strictEqual(result.modelPromptPath, './m.md');
    assert.strictEqual(result.synthPromptPath, './s.md');
  });

  it('should treat only the first :: as the prompt separator (:: in filename)', () => {
    const result = parseAltOpinionArgs(argv('--model=llmproxy/b::c::d.md', '--file=test.md'));
    assert.deepStrictEqual(result.models[0], {
      provider: 'llmproxy',
      model: 'b',
      promptPath: 'c::d.md',
    });
  });

  it('should throw when no --model flags are provided', () => {
    assert.throws(
      () => parseAltOpinionArgs(argv('--synthModel=llmproxy/gpt', '--file=test.md')),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /At least one --model is required/);
        return true;
      }
    );
  });

  it('should throw when no --file and stdin is TTY with no piped content', () => {
    assert.throws(
      () => parseAltOpinionArgs(argv('--model=llmproxy/gpt')),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /No input provided/);
        return true;
      }
    );
  });

  it('should throw when args are empty', () => {
    assert.throws(
      () => parseAltOpinionArgs(argv()),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /At least one --model is required/);
        return true;
      }
    );
  });

  it('should not conflict --file with empty non-TTY stdin', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => false,
      configurable: true,
    });
    const result = parseAltOpinionArgs(argv('--model=llmproxy/test', '--file=/tmp/fake.md'), {
      stdinContent: '',
    });
    assert.strictEqual(result.models[0].provider, 'llmproxy');
    assert.strictEqual(result.file, '/tmp/fake.md');
    assert.strictEqual(result.artifact, '/tmp/fake.md');
  });

  it('should conflict --file with non-TTY stdin that HAS data', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => false,
      configurable: true,
    });
    assert.throws(
      () =>
        parseAltOpinionArgs(argv('--model=llmproxy/test', '--file=/tmp/fake.md'), {
          stdinContent: 'piped data',
        }),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /mutually exclusive/);
        return true;
      }
    );
  });

  it('should accept empty non-TTY stdin without --file as INPUT_MISSING', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      get: () => false,
      configurable: true,
    });
    assert.throws(
      () => parseAltOpinionArgs(argv('--model=llmproxy/test'), { stdinContent: '' }),
      (error: Error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /No input provided/);
        return true;
      }
    );
  });
});
