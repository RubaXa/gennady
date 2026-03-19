/**
 * @purpose Дескриптор, связывающий логическую сессию с физическими ресурсами на диске.
 * @consumer Orchestrator, IAgentCliAdapter
 */
export type SessionContext = {
  /** @purpose Уникальный ID сессии (UUID). */
  sessionId: string;
  /** @purpose Абсолютный путь к изолированной папке (история чата, конфиги). */
  sessionDir: string;
};
