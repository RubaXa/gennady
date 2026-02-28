/**
 * @purpose Предоставить общий логгер с единым контрактом для всего проекта.
 * @consumer core/utils, agents
 * @invariant Контракт: debug(message, detail?), info(message, detail?), warn(message, detail?), error(message, detail?).
 * @sideEffect Console: выводит логи в stdout/stderr.
 */
export const logger = console;
