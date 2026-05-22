// @file: Session JSON and title readers for Claude provider — filesystem access to ~/.claude/
// @consumers: ClaudeProvider
// @tasks: TSK-39

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from '#logger';

/** @purpose Parsed data from a Claude session JSON file (sessions/PID.json). */
export type SessionJsonData = {
  /** @purpose Process ID of the Claude session */
  pid: number;
  /** @purpose Unique session identifier */
  sessionId: string;
  /** @purpose Working directory of the session */
  cwd: string;
  /** @purpose Session start timestamp | @invariant Epoch milliseconds */
  startedAt: number;
};

/**
 * @purpose Read and parse a Claude session JSON file from ~/.claude/sessions/PID.json.
 * @invariant Validates presence of required fields (pid, sessionId, cwd, startedAt); returns null on missing fields.
 * @invariant On parse failure: error-log and return null — does not throw.
 * @param filePath Absolute path to the session JSON file.
 * @returns Parsed session data or null when file is invalid or unreadable.
 * @sideEffect Filesystem: readFileSync on the session JSON file.
 */
export function readSessionJson(filePath: string): SessionJsonData | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const json: unknown = JSON.parse(raw);

    if (typeof json !== 'object' || json === null) {
      logger.warn(`[readSessionJson] [idle -> skipped] Not a JSON object: ${filePath}`);
      return null;
    }

    const obj = json as Record<string, unknown>;

    if (
      typeof obj.pid !== 'number' ||
      typeof obj.sessionId !== 'string' ||
      typeof obj.cwd !== 'string' ||
      typeof obj.startedAt !== 'number'
    ) {
      logger.warn(`[readSessionJson] [idle -> skipped] Missing required fields in: ${filePath}`);
      return null;
    }

    return {
      pid: obj.pid,
      sessionId: obj.sessionId,
      cwd: obj.cwd,
      startedAt: obj.startedAt,
    };
  } catch (cause) {
    const error = new Error('[readSessionJson] Failed to parse session JSON', { cause });
    logger.error(`[readSessionJson] [idle -> failed] ${filePath}`, { error });
    return null;
  }
}

/**
 * @purpose Extract session title from Claude JSONL project file.
 * @invariant cwd path encoding: '/' replaced with '-', leading '-' stripped — matches Claude project directory naming.
 * @invariant Priority: ai-title entry > first user message > 'Unknown' fallback.
 * @param cwd Working directory of the session.
 * @param sessionId Unique session identifier.
 * @returns Session title string; 'Unknown' when JSONL is missing or unparseable.
 * @sideEffect Filesystem: existsSync + readFileSync on ~/.claude/projects/.../<sessionId>.jsonl.
 */
export function readSessionTitle(cwd: string, sessionId: string): string {
  try {
    const projectPath = cwd.replace(/\//g, '-');
    const jsonlPath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`);

    if (!existsSync(jsonlPath)) {
      logger.debug(`[readSessionTitle] [idle -> not-found] JSONL missing: ${jsonlPath}`);
      return 'Unknown';
    }

    const content = readFileSync(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Search for ai-title entry
    for (const line of lines) {
      try {
        const entry: unknown = JSON.parse(line);
        if (
          typeof entry === 'object' &&
          entry !== null &&
          (entry as Record<string, unknown>).type === 'ai-title' &&
          typeof (entry as Record<string, unknown>).aiTitle === 'string'
        ) {
          return (entry as { aiTitle: string }).aiTitle;
        }
      } catch {
        // Skip malformed JSON lines — not all lines may be valid JSON
      }
    }

    // Fallback: first user message
    for (const line of lines) {
      try {
        const entry: unknown = JSON.parse(line);
        if (
          typeof entry === 'object' &&
          entry !== null &&
          (entry as Record<string, unknown>).type === 'user'
        ) {
          const msg = (entry as { message?: { content?: unknown } }).message;
          if (msg?.content) {
            const title =
              typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content) && msg.content.length > 0
                  ? String((msg.content[0] as { text?: string })?.text ?? '')
                  : '';
            if (title) return title;
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    return 'Unknown';
  } catch (cause) {
    const error = new Error('[readSessionTitle] Failed to read session title', { cause });
    logger.warn(`[readSessionTitle] [idle -> failed] cwd=${cwd} sessionId=${sessionId}`, { error });
    return 'Unknown';
  }
}
