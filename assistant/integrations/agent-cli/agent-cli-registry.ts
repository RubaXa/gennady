/*
 * Intent_Map:
 * - START_REGISTRY_DISCOVERY: Promise.allSettled(adapters.map(detect)), filter fulfilled && isInstalled
 * Self_Audit: параллельный detect; fail-safe; синглтоны адаптеров; getAdapterById без проверки установки.
 */
import { logger } from '@shared/common/logger.ts';
import type { IAgentCliAdapter } from './core/agent-cli-adapter.type.ts';
import { ClaudeCliAdapter } from './adapters/claude/claude-cli-adapter.ts';
import { CodexCliAdapter } from './adapters/codex/codex-cli-adapter.ts';
import { CursorCliAdapter } from './adapters/cursor/cursor-cli-adapter.ts';

/** @purpose Зарегистрированные адаптеры (по умолчанию). */
const ADAPTERS_REGISTRY: IAgentCliAdapter[] = [
  new ClaudeCliAdapter(),
  new CodexCliAdapter(),
  new CursorCliAdapter(),
];

/**
 * @purpose Центральная точка входа: Discovery установленных CLI и Factory экземпляров адаптеров.
 * @consumer Orchestrator Service, Startup Logic, User Settings UI
 */
export async function listAvailableAdapters(): Promise<IAgentCliAdapter[]> {
  const all = [...ADAPTERS_REGISTRY];

  logger.debug(`[listAvailableAdapters] [idle → discovering] Adapters to detect: ${all}`);

  const results = Promise.allSettled(
    all.map((a) => a.detect().then((info) => ({ adapter: a, info })))
  );

  const settled = await results;
  const available: IAgentCliAdapter[] = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled' && r.value.info.isInstalled) {
      available.push(r.value.adapter);
    } else if (r.status === 'rejected') {
      logger.warn(
        `[listAvailableAdapters] [discovering] Adapter '${all[i]?.id}' detect failed`,
        r.reason
      );
    }
  }

  logger.info(`[listAvailableAdapters] [discovering → completed] Detected: ${available}`);

  return available;
}

/**
 * @purpose Получение адаптера по ID (проверка установки не выполняется).
 * @param id Уникальный идентификатор адаптера
 * @returns Экземпляр адаптера или undefined при неизвестном ID.
 */
export function getAdapterById(id: string): IAgentCliAdapter | undefined {
  const found = ADAPTERS_REGISTRY.find((a) => a.id === id);
  return found;
}

/**
 * @purpose Динамическая регистрация адаптера (плагинная система).
 * @param adapter Экземпляр адаптера.
 * @consumer Plugin Loader
 */
export function registerAdapter(adapter: IAgentCliAdapter): void {
  if (!ADAPTERS_REGISTRY.some((a) => a.id === adapter.id)) {
    ADAPTERS_REGISTRY.push(adapter);
    logger.debug(`[registerAdapter] [idle → registered] Adapter: ${adapter.id}`);
  }
}
