/**
 * @purpose Предоставить общий логгер с единым контрактом для всего проекта.
 * @consumer core/utils, deps, agents
 * @returns Логгер с методами debug/info/warn/error(message, detail?).
 * @sideEffect Console: выводит логи в stdout/stderr.
 */
export const logger = console;

