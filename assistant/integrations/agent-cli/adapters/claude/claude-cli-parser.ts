/**
 * @purpose Парсинг построчного JSON-стрима Claude CLI в универсальные AgentEvent.
 * @consumer ClaudeCliAdapter
 */

import type { AgentEvent } from '../../core/agent-cli-event.type.ts';

/** Сырая строка из stdout Claude (stream-json). */
type ClaudeStreamLine = {
  type?: string;
  delta?: { type?: string; text?: string };
  tool_use?: { id?: string; name?: string; input?: unknown };
  output?: unknown;
  [key: string]: unknown;
};

/**
 * @purpose Преобразует одну строку JSON от Claude CLI в AgentEvent или null.
 * @param line Строка stdout (одна строка JSON).
 * @returns AgentEvent при известном type, иначе null.
 */
export function parseClaudeStreamLine(line: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as ClaudeStreamLine;
    const timestamp = Math.floor(Date.now() / 1000);
    if (raw.type === 'content_block_delta' && raw.delta?.text) {
      return { type: 'text_delta', payload: raw.delta.text, timestamp };
    }
    if (raw.type === 'tool_use' && raw.tool_use) {
      const t = raw.tool_use;
      return {
        type: 'tool_call',
        payload: { tool: t.name ?? '', args: t.input ?? {} },
        timestamp,
      };
    }
    if (
      raw.type === 'tool_result' ||
      (raw.output !== undefined && raw.type !== 'content_block_delta')
    ) {
      return { type: 'tool_result', payload: raw.output ?? raw, timestamp };
    }
    return null;
  } catch {
    return null;
  }
}
