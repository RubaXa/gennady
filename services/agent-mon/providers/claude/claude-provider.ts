// @file: ClaudeProvider — AgentProvider adapter for Claude Code sessions
// @consumers: monitor
// @tasks: TSK-39

import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from '#logger';

import type { AgentSession } from '../../model/agent-session.type.js';
import type { ScanOpts } from '../../model/scan-opts.type.js';
import type { AgentProvider } from '../../model/agent-provider.type.js';
import { psInfo as defaultPsInfo, parseClaudeArgs as defaultParseClaudeArgs } from './ps.ts';
import { parseContextHint } from './ps.ts';
import type { PsInfoEntry } from './ps.ts';
import {
  readSessionJson as defaultReadSessionJson,
  readSessionTitle as defaultReadSessionTitle, readActiveTaskTitle,
} from './session-json.ts';

// #region START_CLAUDE_PROVIDER_DEPS_TYPE
/** @purpose DI-injectable dependencies for ClaudeProvider — enables test mocking without global monkey-patching. */
type ClaudeProviderDeps = {
  /** @purpose Batch ps inspection function */
  psInfo?: typeof defaultPsInfo;
  /** @purpose Claude CLI argument parser */
  parseClaudeArgs?: typeof defaultParseClaudeArgs;
  /** @purpose Session JSON file reader */
  readSessionJson?: typeof defaultReadSessionJson;
  /** @purpose Session title extractor from JSONL */
  readSessionTitle?: typeof defaultReadSessionTitle;
};
// #endregion END_CLAUDE_PROVIDER_DEPS_TYPE

/**
 * @purpose Adapter scanning Claude Code sessions from ~/.claude/sessions/.
 * @implements {AgentProvider} in ../../model/agent-provider.type.ts
 * @invariant Stateless — every scan() call is independent.
 * @invariant Graceful degradation: missing sessions dir or ps failure returns [], never throws.
 * @invariant Batch ps: one spawn per scan (not per PID).
 */
export class ClaudeProvider implements AgentProvider {
  /** @see {AgentProvider#key} in ../../model/agent-provider.type.ts */
  readonly key: 'claude' = 'claude';

  protected _psInfo: typeof defaultPsInfo;
  protected _parseClaudeArgs: typeof defaultParseClaudeArgs;
  protected _readSessionJson: typeof defaultReadSessionJson;
  protected _readSessionTitle: typeof defaultReadSessionTitle;
  protected _logger: typeof logger;

  /**
   * @purpose Construct with optional DI overrides for testing.
   * @param deps Injectable function replacements; omitted deps use real implementations.
   */
  constructor(deps?: ClaudeProviderDeps) {
    this._psInfo = deps?.psInfo ?? defaultPsInfo;
    this._parseClaudeArgs = deps?.parseClaudeArgs ?? defaultParseClaudeArgs;
    this._readSessionJson = deps?.readSessionJson ?? defaultReadSessionJson;
    this._readSessionTitle = deps?.readSessionTitle ?? defaultReadSessionTitle;
    this._logger = logger;
  }

  /** @see {AgentProvider#scan} in ../../model/agent-provider.type.ts */
  async scan(opts?: ScanOpts): Promise<AgentSession[]> {
    this._logger.debug('[ClaudeProvider#scan] [idle -> scanning]');

    // #region START_READ_SESSION_DIRECTORY
    const sessionDir = join(homedir(), '.claude', 'sessions');
    let fileNames: string[];
    try {
      fileNames = readdirSync(sessionDir).filter((f) => f.endsWith('.json'));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        this._logger.warn(
          `[ClaudeProvider#scan] [scanning -> not-found] Sessions dir missing: ${sessionDir}`
        );
        return [];
      }
      const error = new Error('[ClaudeProvider#scan] Failed to read sessions directory', { cause });
      this._logger.error(`[ClaudeProvider#scan] [scanning -> failed]`, { error });
      return [];
    }
    // #endregion END_READ_SESSION_DIRECTORY

    // #region START_PARSE_SESSION_FILES
    type RawSession = {
      pid: number;
      sessionId: string;
      cwd: string;
      startedAt: number;
      lastActivityAt: number;
    };

    const sessions: RawSession[] = [];
    for (const fileName of fileNames) {
      const filePath = join(sessionDir, fileName);
      const parsed = this._readSessionJson(filePath);
      if (!parsed) continue;

      let lastActivityAt = 0;
      try {
        lastActivityAt = statSync(filePath).mtimeMs;
      } catch {
        lastActivityAt = parsed.startedAt;
      }

      sessions.push({
        pid: parsed.pid,
        sessionId: parsed.sessionId,
        cwd: parsed.cwd,
        startedAt: parsed.startedAt,
        lastActivityAt,
      });
    }

    if (sessions.length === 0) {
      this._logger.debug('[ClaudeProvider#scan] [scanning -> empty] No valid sessions found');
      return [];
    }
    // #endregion END_PARSE_SESSION_FILES

    // #region START_BATCH_PS_AND_BUILD — invariant: one ps spawn for all PIDs, batch contract from ticket
    const pids = sessions.map((s) => s.pid);
    const psResults = this._psInfo(pids);

    const now = Date.now();
    const result: AgentSession[] = [];
    for (const s of sessions) {
      const psEntry: PsInfoEntry | undefined = psResults.get(s.pid);
      const isAlive = psEntry !== undefined;

      let status: AgentSession['status'];
      let idleSeconds: number | undefined;
      let completedAt: number | undefined;

      if (isAlive) {
        // active if process is using CPU (> 0), otherwise idle
        if ((psEntry?.cpuPercent ?? 0) > 0) {
          status = 'active';
        } else {
          status = 'idle';
          idleSeconds = s.lastActivityAt > 0 ? (now - s.lastActivityAt) / 1000 : undefined;
        }
      } else {
        status = 'completed';
        completedAt = s.lastActivityAt > 0 ? s.lastActivityAt : now;
      }

      const model = psEntry ? this._parseClaudeArgs(psEntry.args).model : undefined;
      let title = this._readSessionTitle(s.cwd, s.sessionId);

      if (title === 'Unknown') {
        title = readActiveTaskTitle(s.sessionId);
      }
      if (title === 'Unknown' && psEntry) {
        const hint = parseContextHint(psEntry.args);
        if (hint) title = `${path.basename(s.cwd)}: ${hint}`;
        else title = `[${path.basename(s.cwd)}] session`;
      }
      const elapsedSeconds = (now - s.startedAt) / 1000;

      result.push({
        provider: 'claude',
        pid: s.pid,
        sessionId: s.sessionId,
        cwd: s.cwd,
        project: path.basename(s.cwd),
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt > 0 ? s.lastActivityAt : undefined,
        status,
        title,
        model,
        cpuPercent: psEntry?.cpuPercent,
        memoryMb: psEntry?.memoryMb,
        elapsedSeconds,
        idleSeconds,
        completedAt,
      });
    }
    // #endregion END_BATCH_PS_AND_BUILD

    // #region START_FILTER_BY_SINCE
    let filtered = result;
    if (opts?.since !== undefined) {
      const sinceTs = opts.since === 'today' ? startOfToday() : opts.since;
      filtered = result.filter((s) => s.startedAt >= sinceTs);
    }
    // #endregion END_FILTER_BY_SINCE

    this._logger.info(
      `[ClaudeProvider#scan] [scanning -> completed] ${filtered.length} sessions (${result.length} total)`
    );
    return filtered;
  }
}

/**
 * @purpose Compute start-of-today timestamp in epoch milliseconds (local timezone).
 * @returns Midnight today in epoch ms.
 */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
