import { readFileSync, writeFileSync } from 'node:fs';
import fg from 'fast-glob';
import { logger } from '../shared/common/logger.ts';

/**
 * @purpose Нормализовать импорты в declaration-файлах dist: заменить `.ts` на `.js`.
 * @consumer build:types
 * @sideEffect Filesystem: чтение/запись declaration-файлов в dist; Console: структурированные логи.
 */
async function normalizeDtsImports(): Promise<void> {
  logger.info(`[normalizeDtsImports] [idle → scanning] Searching declaration files`);
  const files = await fg('dist/**/*.d.ts');
  let rewrites = 0;

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const normalized = source.replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2');

    if (normalized !== source) {
      writeFileSync(filePath, normalized);
      rewrites += 1;
    }
  }

  logger.info(`[normalizeDtsImports] [scanning → completed] Imports normalized`, {
    files: files.length,
    rewrites,
  });
}

try {
  await normalizeDtsImports();
} catch (cause) {
  logger.error(`[normalizeDtsImports] [scanning → failed] Failed to normalize declarations`, {
    cause,
  });
  process.exit(1);
}
