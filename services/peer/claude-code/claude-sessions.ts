// @file: Claude Code session registry — enumerate live sessions, resolve by name/id, read peer tokens.
// @spec: PEER
// @consumers: claude-code.transport, claude-send

import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @purpose One live Claude Code session record as written to ~/.claude/sessions/<pid>.json.
 * @consumer claude-sessions
 */
export type ClaudeSession = {
  /** @purpose OS process id that owns the session. */
  pid: number;
  /** @purpose Stable transcript session id (survives pid change). */
  sessionId: string;
  /** @purpose Working directory of the session. */
  cwd: string;
  /** @purpose Human-readable session name (user may rename). */
  name?: string;
  /** @purpose Session kind (`interactive`, `bg`, …). */
  kind?: string;
  /** @purpose Entry point that launched it (`claude-desktop`, `cli`). */
  entrypoint?: string;
  /** @purpose Current status (`idle`, `working`, …). */
  status?: string;
  /** @purpose UDS inbox socket path. */
  messagingSocketPath?: string;
  /** @purpose Background job id, if any. */
  jobId?: string;
  /** @purpose Process start timestamp string used for liveness vetting. */
  procStart?: string;
  /** @purpose Protocol version advertised by the inbox. */
  peerProtocol?: number;
};

/**
 * @purpose Directory holding the Claude Code session records.
 */
export const sessionsDir = (): string =>
  process.env.GENNADY_CLAUDE_SESSIONS_DIR ?? join(homedir(), '.claude', 'sessions');

/**
 * @purpose Directory holding per-project transcript folders.
 */
export const projectsDir = (): string =>
  process.env.GENNADY_CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');

/**
 * @purpose Read all session records; invalid/torn files are skipped.
 */
export const listSessions = (): ClaudeSession[] => {
  let files: string[];
  try {
    files = readdirSync(sessionsDir());
  } catch {
    return [];
  }
  const sessions: ClaudeSession[] = [];
  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(sessionsDir(), file), 'utf8')) as ClaudeSession;
      if (typeof parsed.pid === 'number' && typeof parsed.sessionId === 'string') {
        sessions.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return sessions;
};

/**
 * @purpose Best-effort liveness check for a session pid.
 */
export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * @purpose Runtime view of a session enriched with liveness.
 * @consumer claude-code.transport
 */
export type LiveSession = ClaudeSession & {
  /** @purpose Whether the owning process is currently alive. */
  alive: boolean;
};

/**
 * @purpose List sessions that can be addressed, alive first.
 */
export const listLiveSessions = (): LiveSession[] =>
  listSessions()
    .map((session) => ({ ...session, alive: isAlive(session.pid) }))
    .sort((a, b) => Number(b.alive) - Number(a.alive));

/**
 * @purpose Find sessions by name, sessionId, pid or job id (exact, then prefix).
 */
export const findSessions = (query: string): LiveSession[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = listLiveSessions();
  const exact = all.filter(
    (s) =>
      s.name?.toLowerCase() === q ||
      s.sessionId === query ||
      String(s.pid) === query ||
      s.jobId === query
  );
  if (exact.length > 0) return exact;
  return all.filter(
    (s) =>
      s.name?.toLowerCase().startsWith(q) ||
      s.sessionId.startsWith(query) ||
      s.jobId?.startsWith(query)
  );
};

/**
 * @purpose Resolve exactly one live session for a query.
 * @throws Error when the query matches more than one session.
 */
export const resolveSession = (query: string): LiveSession | undefined => {
  const matches = findSessions(query);
  if (matches.length <= 1) return matches[0];
  const list = matches.map((s) => `${s.name ?? '(unnamed)'} [pid ${s.pid}]`).join(', ');
  throw new Error(`Ambiguous target "${query}": ${matches.length} sessions match (${list})`);
};

/**
 * @purpose Read the current status of a session by pid from its record.
 */
export const sessionStatus = (pid: number): string | undefined => {
  try {
    const rec = JSON.parse(readFileSync(join(sessionsDir(), `${pid}.json`), 'utf8')) as {
      status?: string;
    };
    return rec.status;
  } catch {
    return undefined;
  }
};

/**
 * @purpose Read the inbox auth token for a socket from its key file.
 */
export const readPeerToken = (socketPath: string): string | undefined => {
  const sha = createHash('sha256').update(socketPath).digest('hex');
  const pid = socketPath
    .split('/')
    .pop()
    ?.replace(/\.sock$/, '');
  if (!pid) return undefined;
  try {
    const rec = JSON.parse(readFileSync(join(sessionsDir(), `${pid}.${sha}.key`), 'utf8')) as {
      peerToken?: string;
    };
    return rec.peerToken;
  } catch {
    return undefined;
  }
};

/**
 * @purpose Derive the transcript folder slug Claude Code uses for a working directory.
 */
export const projectSlug = (cwd: string): string => cwd.replace(/[^A-Za-z0-9-]/g, '-');

/**
 * @purpose Absolute path to a session transcript file.
 */
export const transcriptPath = (session: ClaudeSession): string =>
  join(projectsDir(), projectSlug(session.cwd), `${session.sessionId}.jsonl`);
