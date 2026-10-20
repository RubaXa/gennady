// @file: Codex thread store — read threads from state_5.sqlite and activity from rollout JSONL.
// @consumers: codex.transport
// @tasks: N/A

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @purpose One Codex thread with the fields needed for addressing and reading.
 * @consumer codex-store, codex.transport
 */
export type CodexThread = {
  /** @purpose Thread id (uuid). */
  id: string;
  /** @purpose Human title (name or title column). */
  title?: string;
  /** @purpose Working directory. */
  cwd?: string;
  /** @purpose Model used. */
  model?: string;
  /** @purpose Last update time (epoch seconds). */
  lastUpdatedAt?: number;
  /** @purpose Whether the thread is archived. */
  archived?: boolean;
  /** @purpose Path to the rollout JSONL holding the conversation. */
  rolloutPath?: string;
};

/**
 * @purpose Path to the Codex state database holding thread metadata.
 */
export const codexDbPath = (): string =>
  process.env.GENNADY_CODEX_DB ?? join(homedir(), '.codex', 'state_5.sqlite');

/**
 * @purpose Resolve the configured executable or a supported Codex app bundle.
 */
export const codexBinPath = (): string => {
  const configured = process.env.GENNADY_CODEX_BIN;
  if (configured !== undefined) return configured;
  const bundled =
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
  const legacy = '/Applications/ChatGPT.app/Contents/Resources/codex';
  return [bundled, legacy].find((path) => existsSync(path)) ?? bundled;
};

/**
 * @purpose Run a read-only SQLite query returning JSON rows.
 * @param sql Select statement.
 * @returns Parsed rows, or [] on failure.
 */
const queryJson = <T>(sql: string): T[] => {
  const db = codexDbPath();
  if (!existsSync(db)) return [];
  try {
    const out = execFileSync('sqlite3', ['-readonly', '-json', db, sql], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const trimmed = out.trim();
    return trimmed ? (JSON.parse(trimmed) as T[]) : [];
  } catch {
    return [];
  }
};

/**
 * @purpose List Codex threads from the state database.
 */
export const listCodexThreads = (): CodexThread[] => {
  const rows = queryJson<{
    id: string;
    name: string | null;
    title: string | null;
    cwd: string;
    model: string | null;
    updated_at: number;
    archived: number;
    rollout_path: string;
  }>(
    'SELECT id, name, title, cwd, model, updated_at, archived, rollout_path FROM threads ORDER BY updated_at DESC LIMIT 1000'
  );
  return rows.map((row) => ({
    id: row.id,
    title: (row.name && row.name.trim()) || (row.title && row.title.trim()) || row.id.slice(0, 8),
    cwd: row.cwd,
    model: row.model ?? undefined,
    lastUpdatedAt: row.updated_at,
    archived: row.archived === 1,
    rolloutPath: row.rollout_path,
  }));
};

/**
 * @purpose Resolve a thread's rollout file path.
 */
export const rolloutPathFor = (threadId: string): string | undefined => {
  const rows = queryJson<{ rollout_path: string }>(
    `SELECT rollout_path FROM threads WHERE id='${threadId.replace(/'/g, "''")}' LIMIT 1`
  );
  return rows[0]?.rollout_path;
};

/**
 * @purpose Extract assistant text messages from a rollout JSONL file.
 */
export const readAssistantTextsFromRollout = (path: string): string[] => {
  if (!existsSync(path)) return [];
  const texts: string[] = [];
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = (entry as { payload?: { type?: string; role?: string; content?: unknown } })
      .payload;
    if (!payload || payload.type !== 'message' || payload.role !== 'assistant') continue;
    if (!Array.isArray(payload.content)) continue;
    const text = payload.content
      .filter(
        (block): block is { text: string } =>
          typeof block === 'object' &&
          block !== null &&
          typeof (block as { text?: unknown }).text === 'string'
      )
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text) texts.push(text);
  }
  return texts;
};

/**
 * @purpose List all assistant texts of a thread, oldest first.
 */
export const listAgentTexts = (threadId: string): string[] => {
  const path = rolloutPathFor(threadId);
  return path ? readAssistantTextsFromRollout(path) : [];
};

/**
 * @purpose Read a digest of a thread's activity (last assistant messages).
 */
export const readCodexActivity = (threadId: string): string | null => {
  const texts = listAgentTexts(threadId);
  if (texts.length === 0) return null;
  return texts.slice(-2).join('\n\n---\n\n');
};

/**
 * @purpose Queue a message for an existing Codex thread via the app-server daemon.
 */
export const queueCodexMessage = (threadId: string, text: string, model?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const bin = codexBinPath();
    if (!existsSync(bin)) {
      reject(new Error(`Codex binary not found at ${bin}`));
      return;
    }
    const args = [
      'queue',
      '--thread',
      threadId,
      '--message',
      text,
      ...(model ? ['-m', model] : []),
    ];
    const child = spawn(bin, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('codex queue timed out'));
    }, 60_000);
    timer.unref();
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`codex queue exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
  });
