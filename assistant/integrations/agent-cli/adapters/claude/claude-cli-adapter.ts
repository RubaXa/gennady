/*
 * Intent_Map:
 * - START_CLAUDE_DETECT: spawn --version, parse stdout
 * - START_CLAUDE_CREATE_SESSION: mkdir sessionDir/.claude
 * - START_CLAUDE_MCP_CONFIG: write mcp_config.json, then spawn with --mcp-config
 * - START_CLAUDE_GENERATE: build args (--session-id, -p, --output-format stream-json, --setting-sources local), env HOME/XDG_CONFIG_HOME, spawn, stream parse → onProgress
 * - START_CLAUDE_CLEANUP: rm sessionDir recursive
 * Self_Audit: no single return in anchors; no Manager/Data; no private/#; @see for interface methods; logger + Trace-Prefix; throw with cause.
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
import type { SessionContext } from '../../core/agent-cli-session.type.ts';
import { parseClaudeStreamLine } from './claude-cli-parser.ts';
import type { AgentEvent } from '../../core/agent-cli-event.type.ts';

const CLI_BINARY = 'claude';

/**
 * @purpose HTTP-адаптер для Claude Code CLI: изоляция сессий, MCP через файл, JSON-стрим событий.
 * @consumer Orchestrator Service, AgentCliRegistry
 */
export class ClaudeCliAdapter implements IAgentCliAdapter {
  readonly id = 'claude';

  /** @see {IAgentCliAdapter#detect} in core/agent-cli-adapter.type.ts */
  async detect(): Promise<ToolInstallation> {
    logger.debug('[ClaudeCliAdapter#detect] [idle → checking]');
    // START_CLAUDE_DETECT
    // Проверка через spawn --version: нативный Node без execSync для консистентности с generate
    try {
      const version = await this._runVersion();
      logger.debug('[ClaudeCliAdapter#detect] [checking → installed]', { version });
      return { isInstalled: true, version };
    } catch (cause) {
      logger.debug('[ClaudeCliAdapter#detect] [checking → not-installed]', { cause });
      return { isInstalled: false };
    }
    // END_CLAUDE_DETECT
  }

  /** @see {IAgentCliAdapter#getAvailableModels} in core/agent-cli-adapter.type.ts */
  async getAvailableModels(): Promise<string[]> {
    logger.debug('[ClaudeCliAdapter#getAvailableModels] [idle → listing]');
    // Хардкод-список поддерживаемых моделей Claude Code CLI (2026); list-models при наличии — расширить
    const models = [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
    ];
    logger.debug('[ClaudeCliAdapter#getAvailableModels] [listing → completed]', {
      count: models.length,
    });
    return models;
  }

  /** @see {IAgentCliAdapter#createSession} in core/agent-cli-adapter.type.ts */
  async createSession(baseDir: string): Promise<SessionContext> {
    logger.debug('[ClaudeCliAdapter#createSession] [idle → creating]', { baseDir });
    if (!baseDir?.trim()) {
      const err = new Error('[ClaudeCliAdapter#createSession] baseDir required', {
        cause: undefined,
      });
      logger.error('[ClaudeCliAdapter#createSession] [creating → failed] Invalid baseDir', {
        error: err,
      });
      throw err;
    }
    // START_CLAUDE_CREATE_SESSION
    // Структура .claude внутри sessionDir для изоляции конфигов и истории
    const sessionId = randomUUID();
    const sessionDir = join(baseDir, sessionId);
    await mkdir(join(sessionDir, '.claude'), { recursive: true });
    logger.info('[ClaudeCliAdapter#createSession] [creating → created]', { sessionId, sessionDir });
    return { sessionId, sessionDir };
    // END_CLAUDE_CREATE_SESSION
  }

  /** @see {IAgentCliAdapter#generate} in core/agent-cli-adapter.type.ts */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    logger.debug('[ClaudeCliAdapter#generate] [idle → running]', { cwd: options.cwd });
    if (!options.prompt?.trim()) {
      const err = new Error('[ClaudeCliAdapter#generate] prompt required', { cause: undefined });
      logger.error('[ClaudeCliAdapter#generate] [running → failed] Invalid options', {
        error: err,
      });
      throw err;
    }
    if (options.session && options.session.sessionDir) {
      try {
        await mkdir(options.session.sessionDir, { recursive: true });
      } catch (cause) {
        const error = new Error('[ClaudeCliAdapter#generate] sessionDir not accessible', { cause });
        logger.error('[ClaudeCliAdapter#generate] [running → failed]', { error });
        throw error;
      }
    }

    // START_CLAUDE_MCP_CONFIG
    let mcpConfigPath: string | undefined;
    const mcpServers = options.mcpServers ?? [];
    if (mcpServers.length > 0 && options.session?.sessionDir) {
      const payload = this._mcpServersToClaudeJson(mcpServers);
      mcpConfigPath = join(options.session.sessionDir, 'mcp_config.json');
      await writeFile(mcpConfigPath, JSON.stringify(payload), 'utf8');
    }
    // END_CLAUDE_MCP_CONFIG

    // START_CLAUDE_GENERATE
    const args = this._buildGenerateArgs(options, mcpConfigPath);
    const env = this._buildEnv(options);
    const cwd = options.cwd;

    try {
      const { stdout, stderr, exitCode } = await this._spawnWithStream(
        CLI_BINARY,
        args,
        env,
        cwd,
        options.onProgress
      );
      logger.info('[ClaudeCliAdapter#generate] [running → completed]', { exitCode });
      return { stdout, stderr, exitCode };
    } catch (cause) {
      const error = new Error('[ClaudeCliAdapter#generate] Process failed', { cause });
      logger.error('[ClaudeCliAdapter#generate] [running → failed]', { error });
      throw error;
    }
    // END_CLAUDE_GENERATE
  }

  /** @see {IAgentCliAdapter#cleanupSession} in core/agent-cli-adapter.type.ts */
  async cleanupSession(session: SessionContext): Promise<void> {
    logger.debug('[ClaudeCliAdapter#cleanupSession] [idle → cleaning]', {
      sessionId: session.sessionId,
    });
    // START_CLAUDE_CLEANUP
    try {
      await rm(session.sessionDir, { recursive: true, force: true });
      logger.info('[ClaudeCliAdapter#cleanupSession] [cleaning → cleaned]', {
        sessionId: session.sessionId,
      });
    } catch (cause) {
      const error = new Error('[ClaudeCliAdapter#cleanupSession] Cleanup failed', { cause });
      logger.error('[ClaudeCliAdapter#cleanupSession] [cleaning → failed]', { error });
      throw error;
    }
    // END_CLAUDE_CLEANUP
  }

  /**
   * @purpose Запуск CLI с флагом --version для проверки установки и получения версии.
   * @returns Вывод stdout процесса или reject при ненулевом коде.
   * @sideEffect Spawn процесса.
   */
  protected _runVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(CLI_BINARY, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
   * @purpose Преобразование McpServerConfig[] в структуру для --mcp-config JSON.
   * @param servers Список MCP-серверов из опций.
   * @returns Объект с ключом mcpServers для сериализации в файл.
   */
  protected _mcpServersToClaudeJson(servers: McpServerConfig[]): unknown {
    return {
      mcpServers: servers.map((s) => ({
        command: s.command,
        args: s.args ?? [],
        env: s.env ?? {},
      })),
    };
  }

  /**
   * @purpose Сборка аргументов командной строки для headless generate (session-id, mcp-config, allowedTools).
   * @param options Опции запуска.
   * @param mcpConfigPath Путь к файлу MCP-конфига при наличии mcpServers.
   * @returns Массив аргументов для spawn.
   */
  protected _buildGenerateArgs(options: GenerateOptions, mcpConfigPath?: string): string[] {
    const args = [
      '-p',
      options.prompt,
      '--output-format',
      'stream-json',
      '--setting-sources',
      'local',
    ];
    if (options.session) {
      args.push('--session-id', options.session.sessionId);
    }
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath, '--strict-mcp-config');
    }
    const allowed = options.allowedBashCommands ?? [];
    for (const pattern of allowed) {
      args.push('--allowedTools', `Bash(${pattern})`);
    }
    if (options.model) args.push('--model', options.model);
    if (options.temperature !== undefined) args.push('--temperature', String(options.temperature));
    return args;
  }

  /**
   * @purpose Формирование env с изоляцией HOME/XDG_CONFIG_HOME и безопасным мержем options.env (без PATH).
   * @param options Опции запуска (session.sessionDir, env).
   * @returns Объект окружения для spawn.
   */
  protected _buildEnv(options: GenerateOptions): NodeJS.ProcessEnv {
    const base = { ...process.env };
    if (options.session?.sessionDir) {
      base.HOME = options.session.sessionDir;
      base.XDG_CONFIG_HOME = options.session.sessionDir;
    }
    const extra = options.env ?? {};
    const forbidden = new Set(['PATH']);
    for (const [k, v] of Object.entries(extra)) {
      if (!forbidden.has(k)) base[k] = v;
    }
    return base;
  }

  /**
   * @purpose Запуск процесса с перехватом stdout/stderr и построчной отдачей событий в onProgress.
   * @param bin Имя бинарника.
   * @param args Аргументы командной строки.
   * @param env Окружение.
   * @param cwd Рабочая директория.
   * @param onProgress Callback для каждой распарсенной строки JSON (AgentEvent).
   * @returns Агрегированные stdout, stderr и exitCode.
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
          const ev = parseClaudeStreamLine(line);
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
}
