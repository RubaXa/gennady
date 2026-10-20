// @file: Read Claude Code session transcripts — line markers and new assistant text.
// @consumers: claude-code.transport
// @tasks: N/A

import { readFileSync } from 'node:fs';

/**
 * @purpose One assistant text answer extracted from a transcript.
 * @consumer claude-transcript
 */
export type AssistantTurn = {
  /** @purpose Assistant text blocks joined into one answer. */
  text: string;
  /** @purpose Transcript uuid of the assistant message. */
  uuid?: string;
};

/**
 * @purpose Count JSONL lines in a transcript file (0 when the file is absent).
 */
export const countTranscriptLines = (path: string): number => {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
};

/**
 * @purpose Extract assistant text turns added after a line marker.
 */
export const readAssistantTurnsSince = (path: string, fromLine: number): AssistantTurn[] => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter((line) => line.trim());
  const turns: AssistantTurn[] = [];
  for (let i = fromLine; i < lines.length; i++) {
    let entry: unknown;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as { type?: string; uuid?: string; message?: { content?: unknown } };
    if (record.type !== 'assistant') continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter(
        (block): block is { type: 'text'; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          (block as { type?: string }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string'
      )
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text) turns.push({ text, uuid: record.uuid });
  }
  return turns;
};
