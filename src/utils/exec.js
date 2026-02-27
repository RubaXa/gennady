import { execSync as nodeExecSync } from 'node:child_process';
import { logger } from './logger.js';

/**
 * @purpose Выполнить системную команду синхронно с безопасной обработкой ошибок.
 * @consumer git/git-core, другие домены через utils
 * @pre Команда и бинарь доступны в PATH; запуск в корректном окружении.
 * @param cmd Строка команды для выполнения в подпроцессе.
 * @returns Стандартный вывод (stdout) как строка; пустая строка при ошибке.
 * @sideEffect Process: запуск внешнего процесса; Logs: error при сбое.
 */
export const execSyncSafe = (cmd) => {
	try {
		return nodeExecSync(cmd, { encoding: 'utf-8' });
	} catch (cause) {
		logger.error(`[execSyncSafe] [running -> failed] Command failed`, { cause });
		return '';
	}
};

