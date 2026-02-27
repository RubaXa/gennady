import { performance } from 'node:perf_hooks';

import { logger } from '../utils/logger.js';
import { findPackageRoot } from './find-package-root.js';
import { runNpmInstall } from './npm-install.js';

/**
 * @purpose Лениво импортировать модуль по имени и при необходимости установить его в node_modules (без изменения package.json).
 * @consumer agents, core/deps
 * @param specifier Имя npm-пакета (specifier), который нужно импортировать (например 'chalk' или '@scope/pkg').
 * @throws {Error} Если импорт модуля завершается ошибкой даже после установки или если установка не удалась.
 * @returns Promise, который резолвится в модуль, возвращаемый dynamic import().
 * @sideEffect Filesystem: читает package.json и node_modules; Process: запускает npm install при отсутствии модуля; Logs: пишет служебные события.
 */
export const npmImport = async (specifier) => {
	const startedAt = performance.now();

	logger.debug(`[npmImport] [idle -> resolving] ${specifier}`);

	try {
		const mod = await import(specifier);

		logger.debug(`[npmImport] [resolving -> loaded] Cached: ${specifier}`);

		return mod;
	} catch (cause) {
		const isNotFound =
			cause?.code === 'ERR_MODULE_NOT_FOUND' ||
			cause?.code === 'MODULE_NOT_FOUND' ||
			(cause?.message && cause.message.includes('Cannot find module'));

		if (!isNotFound) {
			logger.error(`[npmImport] [resolving -> failed] Not MODULE_NOT_FOUND: ${specifier}`, { cause });
			throw new Error('[npmImport] Import failed', { cause });
		}

		logger.debug(`[npmImport] [resolving -> installing] Not in node_modules: ${specifier}`);

		const root = findPackageRoot();
		await runNpmInstall(root, specifier);

		try {
			const mod = await import(specifier);
			const time = performance.now() - startedAt;

			logger.info(`[npmImport] [installing -> loaded] ${specifier} (${time.toFixed(2)}ms)`);

			return mod;
		} catch (err) {
			const time = performance.now() - startedAt;

			logger.error(`[npmImport] [installing -> failed] Second import: ${specifier} (${time.toFixed(2)}ms)`, { cause: err });
			throw new Error('[npmImport] Import failed after install', { cause: err });
		}
	}
};

