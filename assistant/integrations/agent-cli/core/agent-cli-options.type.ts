import type { AgentEvent } from './agent-cli-event.type.ts';
import type { SessionContext } from './agent-cli-session.type.ts';

/**
 * @purpose Декларативное описание запускаемого MCP-сервера для инъекции в конфиг агента.
 * @consumer Адаптер (генерация JSON/TOML конфигов).
 */
export type McpServerConfig = {
  /** @purpose Внутренний идентификатор для логов. */
  id: string;
  /** @purpose Исполняемый файл (например docker, node, uv). */
  command: string;
  /** @purpose Аргументы запуска. */
  args?: string[];
  /** @purpose Переменные окружения процесса MCP-сервера. */
  env?: Record<string, string>;
};

/**
 * @purpose DTO намерения выполнения: всё необходимое для запуска агента без привязки к конкретному CLI.
 * @consumer IAgentCliAdapter
 * @invariant allowedBashCommands и mcpServers имеют приоритет над внутренними настройками агента.
 */
export type GenerateOptions = {
  /** @purpose Текст инструкции для LLM. */
  prompt: string;
  /** @purpose Рабочая директория для файловых операций агента (не директория сессии). */
  cwd: string;
  /** @purpose Контекст предыдущего диалога; undefined — one-shot. */
  session?: SessionContext;
  /** @purpose Список MCP-серверов, доступных агенту. */
  mcpServers?: McpServerConfig[];
  /** @purpose Whitelist нативных команд (glob patterns). */
  allowedBashCommands?: string[];
  /** @purpose Дополнительные переменные окружения проекта. */
  env?: Record<string, string>;
  /** @purpose Callback событий в реальном времени (токены, tool_call). */
  onProgress?: (event: AgentEvent) => void;
  /** @purpose Явный выбор модели LLM. */
  model?: string;
  /** @purpose Креативность генерации (0.0–1.0). */
  temperature?: number;
};
