// @file: Unit tests for inbox-chat ChatTranscript — empty-file degrade, append/load round trip,
//   lazy chats/ directory creation, mrRef path encoding, malformed-line resilience.
// @consumers: node:test runner
// @tasks: TSK-126

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ChatTranscript } from '../chat-transcript.ts';
import type { ChatTurn } from '../types.ts';
import { makeTestTmpDir } from '../../inbox-core/test-support/test-tmp.ts';

// ── unified context ──

type TranscriptContext = {
  stateDir: string;
  transcript: ChatTranscript;
  mrRef: string;
};

function createTranscriptContext(overrides: Partial<{ mrRef: string }> = {}): TranscriptContext {
  const stateDir = makeTestTmpDir('chat-transcript-');
  return {
    stateDir,
    transcript: new ChatTranscript(stateDir),
    mrRef: overrides.mrRef ?? 'group/proj!42',
  };
}

function buildTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: 'turn-1',
    ts: '2026-07-15T00:00:00.000Z',
    question: 'what changed here?',
    chips: [
      {
        kind: 'mention',
        quote: 'foo.ts',
        source: 'file:foo.ts',
        origin: { artifact: 'foo.ts', startLine: 1, endLine: 1 },
      },
    ],
    answer: 'this changes the retry policy',
    reviewRevision: 0,
    ...overrides,
  };
}

// ── tests ──

describe('ChatTranscript', () => {
  it('Транскрипт переживает отсутствие файла', async () => {
    const { transcript, mrRef } = createTranscriptContext();

    const state = await transcript.load(mrRef);

    assert.deepStrictEqual(state, { turns: [], activeChips: [] });
  });

  it('should persist and reload turns via append then load, with activeChips from the last turn', async () => {
    const { transcript, mrRef } = createTranscriptContext();
    const firstTurn = buildTurn({ id: 'turn-1' });
    const secondTurn = buildTurn({
      id: 'turn-2',
      question: 'and this part?',
      chips: [
        {
          kind: 'candidate',
          quote: 'C-1',
          source: 'review.json#C-1',
          origin: { artifact: 'review.json', startLine: 1, endLine: 1 },
        },
      ],
    });

    await transcript.append(mrRef, firstTurn);
    await transcript.append(mrRef, secondTurn);
    const state = await transcript.load(mrRef);

    assert.deepStrictEqual(state, {
      turns: [firstTurn, secondTurn],
      activeChips: secondTurn.chips,
    });
  });

  it('should create the chats/ directory lazily on first append, not before', async () => {
    const { transcript, stateDir, mrRef } = createTranscriptContext();
    const chatsDir = join(stateDir, 'agent-inbox', 'chats');
    assert.strictEqual(existsSync(chatsDir), false);

    await transcript.append(mrRef, buildTurn());

    assert.strictEqual(existsSync(chatsDir), true);
  });

  it('should encode a slash in mrRef project path as __ in the transcript file name', () => {
    const { transcript } = createTranscriptContext();

    const filePath = transcript.path('group/sub-project!7');

    assert.match(filePath, /group__sub-project-7\.jsonl$/);
  });

  it('should skip a malformed jsonl line without throwing, keeping valid turns', async () => {
    const { transcript, stateDir, mrRef } = createTranscriptContext();
    const validTurn = buildTurn();
    const filePath = transcript.path(mrRef);
    await mkdir(join(stateDir, 'agent-inbox', 'chats'), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(validTurn)}\nnot json\n`, 'utf-8');

    const state = await transcript.load(mrRef);

    assert.deepStrictEqual(state, { turns: [validTurn], activeChips: validTurn.chips });
  });
});
