/*
 * Intent_Map:
 * - START_CURSOR_DETECT: try cursor --version then agent --version (priority cursor)
 * - START_CURSOR_CREATE_SESSION: spawn agent create-chat, parse stdout for chat ID; sessionDir = baseDir/sessionId
 * - START_CURSOR_MCP_PREFLIGHT: write options.cwd/.cursor/mcp.json before generate
 * - START_CURSOR_GENERATE: --resume sessionId, -p, --approve-mcps, --output-format stream-json; parse JSONL → onProgress
 * - START_CURSOR_CLEANUP: rm sessionDir (или no-op если sessionDir только логический)
 * Self_Audit: no private/#; @see for interface; fail-safe detect.
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@shared/common/logger.ts';
import type {
  GenerateResult,
  IAgentCliAdapter,
  ToolInstallation,
} from '../../core/agent-cli-adapter.type.ts';
import type { GenerateOptions, McpServerConfig } from '../../core/agent-cli-options.type.ts';
import type { AgentEvent } from '../../core/agent-cli-event.type.ts';
import type { SessionContext } from '../../core/agent-cli-session.type.ts';
import { parseClaudeStreamLine } from '../claude/claude-cli-parser.ts';

/** Приоритет: cursor, затем agent. */
const CANDIDATE_BINARIES = ['cursor', 'agent'] as const;

/**
 * @purpose Реализация для Cursor Agent CLI: create-chat → --resume, MCP через .cursor/mcp.json в cwd.
 * @consumer Orchestrator Service, AgentCliRegistry
 */
export class CursorCliAdapter implements IAgentCliAdapter {
  readonly id = 'cursor';

  /** @purpose Имя бинарника, выбранного при detect (cursor или agent). */
  protected _resolvedBinary: string = CANDIDATE_BINARIES[0];

  /** @see {IAgentCliAdapter#detect} in core/agent-cli-adapter.type.ts */
  async detect(): Promise<ToolInstallation> {
    logger.debug('[CursorCliAdapter#detect] [idle → checking]');
    // START_CURSOR_DETECT
    for (const bin of CANDIDATE_BINARIES) {
      try {
        const version = await this._runVersion(bin);
        this._resolvedBinary = bin;
        logger.debug('[CursorCliAdapter#detect] [checking → installed]', { binary: bin, version });
        return { isInstalled: true, version };
      } catch {
        continue;
      }
    }
    logger.debug('[CursorCliAdapter#detect] [checking → not-installed]');
    return { isInstalled: false };
    // END_CURSOR_DETECT
  }

  /** @see {IAgentCliAdapter#getAvailableModels} in core/agent-cli-adapter.type.ts */
  async getAvailableModels(): Promise<string[]> {
    const models = ['gpt-4o', 'claude-3-5-sonnet', 'o1'];
    return models;
  }

  /** @see {IAgentCliAdapter#createSession} in core/agent-cli-adapter.type.ts */
  async createSession(baseDir: string): Promise<SessionContext> {
    logger.debug('[CursorCliAdapter#createSession] [idle → creating]', { baseDir });
    if (!baseDir?.trim()) {
      const err = new Error('[CursorCliAdapter#createSession] baseDir required', {
        cause: undefined,
      });
      logger.error('[CursorCliAdapter#createSession] [creating → failed] Invalid baseDir', {
        error: err,
      });
      throw err;
    }
    // START_CURSOR_CREATE_SESSION
    const sessionId = await this._createChatId();
    const sessionDir = join(baseDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    logger.info('[CursorCliAdapter#createSession] [creating → created]', { sessionId, sessionDir });
    return { sessionId, sessionDir };
    // END_CURSOR_CREATE_SESSION
  }

  /** @see {IAgentCliAdapter#generate} in core/agent-cli-adapter.type.ts */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    logger.debug('[CursorCliAdapter#generate] [idle → running]', { cwd: options.cwd });
    if (!options.prompt?.trim()) {
      const err = new Error('[CursorCliAdapter#generate] prompt required', { cause: undefined });
      logger.error('[CursorCliAdapter#generate] [running → failed] Invalid options', {
        error: err,
      });
      throw err;
    }

    // START_CURSOR_MCP_PREFLIGHT
    if (options.mcpServers?.length) {
      const cursorDir = join(options.cwd, '.cursor');
      await mkdir(cursorDir, { recursive: true });
      const mcpJson = this._mcpServersToCursorJson(options.mcpServers);
      await writeFile(join(cursorDir, 'mcp.json'), JSON.stringify(mcpJson), 'utf8');
    }
    // END_CURSOR_MCP_PREFLIGHT

    // START_CURSOR_GENERATE
    const args = this._buildGenerateArgs(options);
    const env = { ...process.env };
    const extra = options.env ?? {};
    const forbidden = new Set(['PATH']);
    for (const [k, v] of Object.entries(extra)) {
      if (!forbidden.has(k)) (env as Record<string, string>)[k] = v;
    }

    try {
      const { stdout, stderr, exitCode } = await this._spawnWithStream(
        this._resolvedBinary,
        args,
        env,
        options.cwd,
        options.onProgress
      );
      logger.info('[CursorCliAdapter#generate] [running → completed]', { exitCode });
      return { stdout, stderr, exitCode };
    } catch (cause) {
      const error = new Error('[CursorCliAdapter#generate] Process failed', { cause });
      logger.error('[CursorCliAdapter#generate] [running → failed]', { error });
      throw error;
    }
    // END_CURSOR_GENERATE
  }

  /** @see {IAgentCliAdapter#cleanupSession} in core/agent-cli-adapter.type.ts */
  async cleanupSession(session: SessionContext): Promise<void> {
    logger.debug('[CursorCliAdapter#cleanupSession] [idle → cleaning]', {
      sessionId: session.sessionId,
    });
    try {
      await rm(session.sessionDir, { recursive: true, force: true });
      logger.info('[CursorCliAdapter#cleanupSession] [cleaning → cleaned]', {
        sessionId: session.sessionId,
      });
    } catch (cause) {
      const error = new Error('[CursorCliAdapter#cleanupSession] Cleanup failed', { cause });
      logger.error('[CursorCliAdapter#cleanupSession] [cleaning → failed]', { error });
      throw error;
    }
  }

  /**
   * @purpose Запуск указанного бинарника с --version для detect.
   * @param bin Имя бинарника (cursor или agent).
   * @returns Вывод stdout или reject при ненулевом коде.
   * @sideEffect Spawn процесса.
   */
  protected _runVersion(bin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.on('close', (code) =>
        code === 0 ? resolve(out.trim()) : reject(new Error(out || 'non-zero exit'))
      );
      child.on('error', reject);
    });
  }

  /**
   * @purpose Вызов create-chat и извлечение ID чата из stdout для sessionId.
   * @returns Идентификатор чата или fallback UUID при неудачном парсинге.
   * @sideEffect Spawn процесса.
   */
  protected _createChatId(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this._resolvedBinary, ['create-chat'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`create-chat failed: ${out}`));
          return;
        }
        const match = /(?:chat[-_]?)?([a-zA-Z0-9-]+)/.exec(out) ?? /^\s*([^\s]+)/.exec(out);
        resolve(match ? match[1].trim() : randomUUID());
      });
      child.on('error', reject);
    });
  }

  /**
   * @purpose Преобразование McpServerConfig[] в структуру для .cursor/mcp.json.
   * @param servers Список MCP-серверов.
   * @returns Объект с ключом mcpServers (id → { command, args, env }).
   */
  protected _mcpServersToCursorJson(servers: McpServerConfig[]): unknown {
    const mcpServers: Record<
      string,
      { command: string; args?: string[]; env?: Record<string, string> }
    > = {};
    for (const s of servers) {
      mcpServers[s.id] = { command: s.command, args: s.args, env: s.env };
    }
    return { mcpServers };
  }

  /**
   * @purpose Сборка аргументов для generate (--resume, -p, --approve-mcps, --force при whitelist).
   * @param options Опции запуска.
   * @returns Массив аргументов для spawn.
   */
  protected _buildGenerateArgs(options: GenerateOptions): string[] {
    const args = ['-p', options.prompt, '--output-format', 'stream-json', '--approve-mcps'];
    if (options.session) args.push('--resume', options.session.sessionId);
    if (options.allowedBashCommands?.length) args.push('--force');
    if (options.model) args.push('--model', options.model);
    return args;
  }

  /**
   * @purpose Запуск процесса с построчным парсингом JSONL и отдачей AgentEvent в onProgress.
   * @param bin Имя бинарника.
   * @param args Аргументы.
   * @param env Окружение.
   * @param cwd Рабочая директория.
   * @param onProgress Callback для каждой распарсенной строки (Claude-совместимый или Cursor-маппинг).
   * @returns Агрегированные stdout, stderr, exitCode.
   * @sideEffect Spawn процесса; вызов onProgress при наличии.
   */
  protected _spawnWithStream(
    bin: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
    onProgress?: (event: AgentEvent) => void
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        const s = chunk.toString();
        stdout += s;
        lineBuffer += s;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const ev = parseClaudeStreamLine(line) ?? this._mapCursorLineToEvent(line);
          if (ev && onProgress) onProgress(ev);
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code, signal) => {
        const exitCode = code ?? (signal ? 1 : 0);
        resolve({ stdout, stderr, exitCode });
      });
      child.on('error', (err) => reject(err));
    });
  }

  /**
   * @purpose Маппинг одной строки JSONL Cursor в AgentEvent при отличии схемы от Claude.
   * @param line Строка stdout (ожидается JSON).
   * @returns AgentEvent или null при неизвестном формате.
   */
  protected _mapCursorLineToEvent(line: string): AgentEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const raw = JSON.parse(trimmed) as { type?: string; text?: string; [k: string]: unknown };
      const timestamp = Math.floor(Date.now() / 1000);
      if (raw.type === 'content_block_delta' && raw.text) {
        return { type: 'text_delta', payload: raw.text, timestamp };
      }
      if (raw.type === 'tool_use') {
        return {
          type: 'tool_call',
          payload: {
            tool: (raw as { name?: string }).name ?? '',
            args: (raw as { input?: object }).input ?? {},
          },
          timestamp,
        };
      }
      if (raw.type === 'tool_result') {
        return { type: 'tool_result', payload: raw, timestamp };
      }
      return null;
    } catch {
      return null;
    }
  }
}
