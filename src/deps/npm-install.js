import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { logger } from '../utils/logger.js';

/**
 * @purpose Установить пакет в node_modules без изменения package.json (npm install --no-save).
 * @consumer deps/npm-import
 * @pre В cwd должен находиться корректный npm-пакет с package.json.
 * @param cwd Абсолютный путь к корню npm-пакета, в котором выполняется установка.
 * @param specifier Имя пакета (npm specifier) для установки в node_modules.
 * @throws {Error} Если команда npm install завершается с ненулевым кодом или не может быть запущена.
 * @returns Promise, который резолвится после успешной установки пакета в node_modules.
 * @sideEffect Process: запускает внешнюю команду npm install с прямой передачей вывода в stdout/stderr.
 */
export const runNpmInstall = (cwd, specifier) => {
	const startedAt = performance.now();

	logger.info(`[runNpmInstall] [idle -> installing] ${specifier} in ${cwd}`);

	return new Promise((resolve, reject) => {
		const child = spawn('npm', ['install', specifier, '--no-save'], {
			cwd,
			stdio: 'inherit',
			shell: true,
		});

		child.on('close', (code) => {
			const time = performance.now() - startedAt;

			if (code === 0) {
				logger.info(`[runNpmInstall] [installing -> completed] ${specifier} (${time.toFixed(2)}ms)`);
				resolve();
				return;
			}

			logger.error(`[runNpmInstall] [installing -> failed] Exit code ${code}: ${specifier} (${time.toFixed(2)}ms)`);
			reject(
				new Error(`[runNpmInstall] npm install exited with code ${code}`, {
					cause: { code, specifier },
				}),
			);
		});

		child.on('error', (cause) => {
			const time = performance.now() - startedAt;

			logger.error(`[runNpmInstall] [installing -> failed] Spawn error: ${specifier} (${time.toFixed(2)}ms)`, { cause });
			reject(new Error('[runNpmInstall] Spawn failed', { cause }));
		});
	});
};

