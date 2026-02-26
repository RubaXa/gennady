import { execSync as nodeExecSync } from 'node:child_process';

/**
 * @purpose Выполнить системную команду синхронно с безопасной обработкой ошибок.
 * @consumer core/utils
 * @pre Команда и бинарь доступны в PATH; запуск в корректном окружении.
 * @param cmd Строка команды для выполнения в подпроцессе.
 * @returns Стандартный вывод (stdout) как строка; пустая строка при ошибке.
 * @sideEffect IO: Запуск внешнего процесса через child_process.execSync.
 */
export const execSyncSafe = (cmd) => {
	try {
		return nodeExecSync(cmd, { encoding: 'utf-8' });
	} catch (err) {
		console.warn(`[execSyncSafe] ${err}`, err);
		return '';
	}
};

