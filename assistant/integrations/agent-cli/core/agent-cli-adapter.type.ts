import type { GenerateOptions } from './agent-cli-options.type.ts';
import type { SessionContext } from './agent-cli-session.type.ts';

/**
 * @purpose Результат проверки наличия CLI-инструмента в среде (PATH) и его версии.
 * @consumer IAgentCliAdapter implementations, Health Check
 */
export type ToolInstallation = {
  /** @purpose Флаг установленности бинарника. */
  isInstalled: boolean;
  /** @purpose Версия CLI (сырой вывод --version при наличии). */
  version?: string;
};

/**
 * @purpose Итог выполнения задачи агента (агрегированный вывод и код выхода).
 * @consumer Orchestrator
 */
export type GenerateResult = {
  /** @purpose Полный текст ответа агента (агрегированный из стрима). */
  stdout: string;
  /** @purpose Логи ошибок процесса. */
  stderr: string;
  /** @purpose Код выхода процесса (0 — успех). */
  exitCode: number;
};

/**
 * @purpose Единый контракт для всех CLI-агентов (Cursor, Codex, Claude). Абстрагирует различия в синтаксисе флагов, управлении процессами и протоколах ввода-вывода.
 * @consumer Orchestrator Service, AI Gateway, CI/CD Pipeline Runners
 * @invariant Процесс generate всегда запускается в изолированном cwd; stdout всегда перехватывается.
 */
export interface IAgentCliAdapter {
  /** @purpose Уникальный идентификатор реализации адаптера. @consumer Логирование, метрики, динамическая загрузка. */
  readonly id: string;

  /**
   * @purpose Проверка наличия CLI в PATH и определение версии.
   * @returns Объект с флагом isInstalled и версией.
   * @sideEffect Запускает процесс с флагом --version.
   */
  detect(): Promise<ToolInstallation>;

  /**
   * @purpose Список доступных для данного CLI моделей.
   * @returns Массив идентификаторов моделей.
   * @consumer UI (выбор модели).
   */
  getAvailableModels(): Promise<string[]>;

  /**
   * @purpose Подготовка изолированного окружения для stateful-взаимодействия.
   * @param baseDir Корневой путь для папок сессий (например /tmp/agent_sessions).
   * @returns Контекст сессии с sessionId и sessionDir.
   * @post Директория sessionDir создана и готова к записи конфигов.
   * @sideEffect Создание директорий на диске.
   */
  createSession(baseDir: string): Promise<SessionContext>;

  /**
   * @purpose Основной метод исполнения: запуск агента, трансляция опций в аргументы, стриминг событий.
   * @param options Полная конфигурация запуска (промпт, cwd, session, mcp, callback).
   * @pre Если передан options.session, session.sessionDir должен существовать.
   * @returns Финальный результат (stdout, stderr, exitCode).
   * @throws {Error} Ошибка запуска/выполнения процесса (с cause).
   * @sideEffect Spawns child process; IO (временные конфиги); Network (если агент ходит в интернет).
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * @purpose Освобождение ресурсов сессии (удаление директорий, остановка зомби-процессов).
   * @param session Контекст сессии для очистки.
   * @sideEffect fs.rm recursive целевой директории.
   */
  cleanupSession(session: SessionContext): Promise<void>;
}
