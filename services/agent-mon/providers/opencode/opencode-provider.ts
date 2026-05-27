// @file: OpenCode session scanner — adapter implementing AgentProvider via SQLite
// @consumers: monitor, CLI
// @tasks: TSK-40

import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '#logger';
import type { AgentSession } from '../../model/agent-session.type.js';
import type { ScanOpts } from '../../model/scan-opts.type.js';
import type { AgentProvider } from '../../model/agent-provider.type.js';
import {
  querySessions as defaultQuerySessions,
  queryLastMessage as defaultQueryLastMessage,
} from './db.ts';
import { parseModelJson as defaultParseModelJson } from './model-parser.ts';

/** @purpose Injectable constructor dependencies for OpenCodeProvider testing and customization. */
export type OpenCodeProviderDeps = {
  /** @purpose Custom SQLite database path override */
  dbPath?: string;
  /** @purpose Session query function injectable for testing */
  querySessions?: typeof defaultQuerySessions;
  /** @purpose Last message query function injectable for testing */
  queryLastMessage?: typeof defaultQueryLastMessage;
  /** @purpose Model JSON parser injectable for testing */
  parseModelJson?: typeof defaultParseModelJson;
};

const DEFAULT_DB_PATH = '~/.local/share/opencode/opencode.db';

/**
 * @purpose Adapter scanning OpenCode agent sessions via SQLite.
 * @implements {AgentProvider} in ../../model/agent-provider.type.ts
 */
export class OpenCodeProvider implements AgentProvider {
  /** @purpose Provider identifier key ('opencode') */
  readonly key = 'opencode';
  /** @purpose Resolved dependency injection container */
  protected _deps: Required<OpenCodeProviderDeps>;
  /** @purpose Logger instance for structured logging */
  protected _logger = logger;

  /**
   * @purpose Construct with optional dependency injection for testing.
   * @param [deps] Injectable query functions and db path overrides.
   */
  constructor(deps?: OpenCodeProviderDeps) {
    this._deps = {
      dbPath: deps?.dbPath ?? DEFAULT_DB_PATH,
      querySessions: deps?.querySessions ?? defaultQuerySessions,
      queryLastMessage: deps?.queryLastMessage ?? defaultQueryLastMessage,
      parseModelJson: deps?.parseModelJson ?? defaultParseModelJson,
    };
  }

  /** @see {AgentProvider#scan} in ../../model/agent-provider.type.ts */
  async scan(opts?: ScanOpts): Promise<AgentSession[]> {
    this._logger.debug('[OpenCodeProvider#scan] [idle → opening]');

    const dbPath = this._resolvePath(this._deps.dbPath);

    // #region START_OPEN_DATABASE — invariant: missing db → empty array with warning, per graceful degradation contract
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(dbPath);
    } catch (cause) {
      this._logger.warn(`[OpenCodeProvider#scan] [opening → not_found] ${dbPath}`, { cause });
      return [];
    }
    // #endregion END_OPEN_DATABASE

    // #region START_QUERY_AND_BUILD — invariant: query failure → empty array with error log, per AgentProvider contract
    try {
      const rows = this._deps.querySessions(db, opts);
      const sessions: AgentSession[] = [];

      for (const row of rows) {
        const modelId = this._deps.parseModelJson(row.model);
        const lastMessage = this._deps.queryLastMessage(db, row.id);
        const startedAt = row.time_created;
        const lastActivityAt = row.time_updated;
        const elapsedSeconds = Math.max(0, Math.round((lastActivityAt - startedAt) / 1000));

        sessions.push({
          provider: 'opencode',
          pid: null,
          sessionId: row.slug,
          parentId: row.parent_id ?? undefined,
          title: row.title ?? '',
          slug: row.slug,
          cwd: row.directory,
          project: row.directory.split('/').pop() ?? row.directory,
          model: modelId,
          agent: row.agent ?? undefined,
          status: 'active',
          startedAt,
          lastActivityAt,
          elapsedSeconds,
          tokensInput: row.tokens_input ?? undefined,
          tokensOutput: row.tokens_output ?? undefined,
          lastMessage: lastMessage ?? undefined,
        });
      }

      this._logger.info(`[OpenCodeProvider#scan] [querying → scanned] ${sessions.length} sessions`);
      return sessions;
    } catch (cause) {
      const error = new Error('[OpenCodeProvider#scan] Query failed', { cause });
      this._logger.error('[OpenCodeProvider#scan] [querying → failed]', { error });
      return [];
    } finally {
      // close must run regardless of success or failure
      db.close();
    }
    // #endregion END_QUERY_AND_BUILD
  }

  /**
   * @purpose Resolve tilde-prefixed path to an absolute path using the home directory.
   * @param raw Raw path string potentially starting with ~/.
   * @returns Absolute path with ~ resolved to os.homedir().
   */
  protected _resolvePath(raw: string): string {
    if (raw.startsWith('~/')) {
      return path.join(os.homedir(), raw.slice(2));
    }
    return raw;
  }
}
