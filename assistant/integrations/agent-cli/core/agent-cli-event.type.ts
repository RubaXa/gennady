/**
 * @purpose Дискриминанты типа события стрима агента.
 * @consumer Frontend UI, Logging Systems
 */
export type AgentEventType = 'thought' | 'tool_call' | 'tool_result' | 'text_delta' | 'error';

/**
 * @purpose Универсальная структура события для observability (токены, вызовы инструментов).
 * @consumer Frontend UI, Logging Systems
 */
export type AgentEvent = {
  /** @purpose Тип события. */
  type: AgentEventType;
  /** @purpose Данные: text_delta — строка; tool_call — { tool, args }; thought — строка. */
  payload: unknown;
  /** @purpose Unix timestamp момента возникновения. */
  timestamp: number;
};
