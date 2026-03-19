/*
 * Intent_Map:
 * - START_CODEX_DETECT: spawn codex --version
 * - START_CODEX_CREATE_SESSION: mkdir sessionDir
 * - START_CODEX_MCP_CONFIG: write sessionDir/.codex/config.toml
 * - START_CODEX_GENERATE: env HOME=sessionDir, codex exec | codex resume --last, raw stdout → text_delta onProgress
 * - START_CODEX_CLEANUP: rm sessionDir recursive
 * Self_Audit: allowedBashCommands → warning and ignore; no private/#; @see for interface.
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
import type { GenerateOptions } from '../../core/agent-cli-options.type.ts';
import type { SessionContext } from '../../core/agent-cli-session.type.ts';
import { serializeMcpServersToToml } from './codex-cli-toml.ts';

const CLI_BINARY = 'codex';

/**
 * @purpose Реализация для Codex CLI: изоляция через HOME, MCP через TOML, вывод как raw text.
 * @consumer Orchestrator Service, AgentCliRegistry
 */
export class CodexCliAdapter implements IAgentCliAdapter {
  readonly id = 'codex';

  /** @see {IAgentCliAdapter#detect} in core/agent-cli-adapter.type.ts */
  async detect(): Promise<ToolInstallation> {
    logger.debug('[CodexCliAdapter#detect] [idle → checking]');
    // START_CODEX_DETECT
    try {
      const version = await this._runVersion();
      logger.debug('[CodexCliAdapter#detect] [checking → installed]', { version });
      return { isInstalled: true, version };
    } catch (cause) {
      logger.debug('[CodexCliAdapter#detect] [checking → not-installed]', { cause });
      return { isInstalled: false };
    }
    // END_CODEX_DETECT
  }

  /** @see {IAgentCliAdapter#getAvailableModels} in core/agent-cli-adapter.type.ts */
  async getAvailableModels(): Promise<string[]> {
    logger.debug('[CodexCliAdapter#getAvailableModels] [idle → listing]');
    const models = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'];
    return models;
  }

  /** @see {IAgentCliAdapter#createSession} in core/agent-cli-adapter.type.ts */
  async createSession(baseDir: string): Promise<SessionContext> {
    logger.debug('[CodexCliAdapter#createSession] [idle → creating]', { baseDir });
    if (!baseDir?.trim()) {
      const err = new Error('[CodexCliAdapter#createSession] baseDir required', {
        cause: undefined,
      });
      logger.error('[CodexCliAdapter#createSession] [creating → failed] Invalid baseDir', {
        error: err,
      });
      throw err;
    }
    // START_CODEX_CREATE_SESSION
    const sessionId = randomUUID();
    const sessionDir = join(baseDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    logger.info('[CodexCliAdapter#createSession] [creating → created]', { sessionId, sessionDir });
    return { sessionId, sessionDir };
    // END_CODEX_CREATE_SESSION
  }

  /** @see {IAgentCliAdapter#generate} in core/agent-cli-adapter.type.ts */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    logger.debug('[CodexCliAdapter#generate] [idle → running]', { cwd: options.cwd });
    if (!options.prompt?.trim()) {
      const err = new Error('[CodexCliAdapter#generate] prompt required', { cause: undefined });
      logger.error('[CodexCliAdapter#generate] [running → failed] Invalid options', { error: err });
      throw err;
    }

    // START_CODEX_ALLOWED_WARNING
    if (options.allowedBashCommands?.length) {
      logger.warn(
        '[CodexCliAdapter#generate] [running] allowedBashCommands ignored by Codex CLI; using workspace sandbox',
        {
          allowed: options.allowedBashCommands,
        }
      );
    }
    // END_CODEX_ALLOWED_WARNING

    // START_CODEX_MCP_CONFIG
    const codexDir = options.session ? join(options.session.sessionDir, '.codex') : undefined;
    if (codexDir && options.mcpServers?.length) {
      await mkdir(codexDir, { recursive: true });
      const toml = serializeMcpServersToToml(options.mcpServers);
      await writeFile(join(codexDir, 'config.toml'), toml, 'utf8');
    }
    // END_CODEX_MCP_CONFIG

    // START_CODEX_GENERATE
    const env = this._buildEnv(options);
    const cwd = options.cwd;
    const useResume = Boolean(options.session?.sessionDir);
    const args = useResume
      ? ['resume', '--last', '-p', options.prompt]
      : ['exec', '-a', 'never', '-p', options.prompt];
    if (options.model) args.push('--model', options.model);
    if (options.allowedBashCommands?.length) args.push('-s', 'workspace-write');

    try {
      const { stdout, stderr, exitCode } = await this._spawnRaw(
        CLI_BINARY,
        args,
        env,
        cwd,
        options.onProgress
      );
      logger.info('[CodexCliAdapter#generate] [running → completed]', { exitCode });
      return { stdout, stderr, exitCode };
    } catch (cause) {
      const error = new Error('[CodexCliAdapter#generate] Process failed', { cause });
      logger.error('[CodexCliAdapter#generate] [running → failed]', { error });
      throw error;
    }
    // END_CODEX_GENERATE
  }

  /** @see {IAgentCliAdapter#cleanupSession} in core/agent-cli-adapter.type.ts */
  async cleanupSession(session: SessionContext): Promise<void> {
    logger.debug('[CodexCliAdapter#cleanupSession] [idle → cleaning]', {
      sessionId: session.sessionId,
    });
    // START_CODEX_CLEANUP
    try {
      await rm(session.sessionDir, { recursive: true, force: true });
      logger.info('[CodexCliAdapter#cleanupSession] [cleaning → cleaned]', {
        sessionId: session.sessionId,
      });
    } catch (cause) {
      const error = new Error('[CodexCliAdapter#cleanupSession] Cleanup failed', { cause });
      logger.error('[CodexCliAdapter#cleanupSession] [cleaning → failed]', { error });
      throw error;
    }
    // END_CODEX_CLEANUP
  }

  /**
   * @purpose Запуск codex --version для проверки установки и получения версии.
   * @returns Вывод stdout или reject при ненулевом коде.
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
   * @purpose Формирование env с HOME/XDG_CONFIG_HOME из sessionDir и мержем options.env (PATH исключён).
   * @param options Опции запуска.
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
   * @purpose Запуск процесса с перехватом stdout/stderr; весь stdout отдаётся как text_delta в onProgress.
   * @param bin Имя бинарника.
   * @param args Аргументы.
   * @param env Окружение.
   * @param cwd Рабочая директория.
   * @param onProgress Callback для чанков вывода (тип text_delta).
   * @returns Агрегированные stdout, stderr, exitCode.
   * @sideEffect Spawn процесса; вызов onProgress при наличии.
   */
  protected _spawnRaw(
    bin: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    cwd: string,
    onProgress?: (event: import('../../core/agent-cli-event.type.ts').AgentEvent) => void
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        const s = chunk.toString();
        stdout += s;
        if (onProgress) {
          onProgress({ type: 'text_delta', payload: s, timestamp: Math.floor(Date.now() / 1000) });
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
