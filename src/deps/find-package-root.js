import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { logger } from '../utils/logger.js';

/**
 * @purpose Найти корень npm-пакета относительно заданного стартового каталога.
 * @consumer deps/npm-import
 * @param [startDir] Стартовый каталог поиска; по умолчанию используется process.cwd().
 * @returns Абсолютный путь к каталогу с package.json или исходный startDir, если корень не найден.
 * @sideEffect Filesystem: синхронно проверяет наличие package.json вверх по дереву директорий.
 */
export const findPackageRoot = (startDir = process.cwd()) => {
	logger.debug(`[findPackageRoot] [idle -> walking] From ${startDir}`);

	let dir = startDir;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const pkgPath = join(dir, 'package.json');

		if (existsSync(pkgPath)) {
			logger.debug(`[findPackageRoot] [walking -> found] ${dir}`);
			return dir;
		}

		const parent = dirname(dir);

		if (parent === dir) {
			logger.warn(`[findPackageRoot] [walking -> fallback] No package.json upward: ${startDir}`);
			return startDir;
		}

		dir = parent;
	}
};

