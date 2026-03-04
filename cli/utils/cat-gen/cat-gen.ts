import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { logger } from '../../../shared/common/logger.ts';

/**
 * @purpose Список расширений файлов по умолчанию для сбора контента (cat).
 * @consumer catGen
 */
export const DEFAULT_EXTENSIONS = ['.md', '.mdc', '.js', '.ts', '.tsx', '.go', '.sh', '.puml', '.'];

/**
 * @purpose Опции сбора файлов: расширения, исключения, отключение дефолтных исключений.
 * @consumer catGen
 */
export type CatGenOptions = {
  extensions?: string[];
  exclude?: string | string[];
  ignoreDefaultExcludes?: boolean;
};

/**
 * @purpose Один результат catGen: абсолютный путь, относительный путь, содержимое файла.
 * @consumer catGen, cmd/cat
 */
export type CatGenResult = {
  absPath: string;
  relativePath: string;
  contents: string;
};

/**
 * @purpose Получить содержимое всех файлов по указанным glob-паттернам для вывода в XML/MD.
 * @consumer CLI (cmd/cat)
 * @param paths Путь к файлу/директории или glob-паттерн(ы); директория раскрывается в **\/*.
 * @param options Опции: extensions, exclude, ignoreDefaultExcludes (node_modules по умолчанию исключён).
 * @returns Массив объектов { absPath, relativePath, contents }; файлы с ошибкой чтения пропускаются.
 * @sideEffect Filesystem: обход и чтение файлов.
 */
export const catGen = (paths: string | string[], options: CatGenOptions = {}): CatGenResult[] => {
  const { extensions = DEFAULT_EXTENSIONS, exclude = [], ignoreDefaultExcludes = false } = options;

  const userExclude = Array.isArray(exclude) ? exclude : [exclude];
  const ignorePatterns = userExclude.map((pattern) => {
    if (!/[*{}!]/.test(pattern)) {
      return `**/*${pattern}`;
    }
    return pattern;
  });

  if (!ignoreDefaultExcludes) {
    ignorePatterns.push('**/node_modules/**');
  }

  const inputPaths = Array.isArray(paths) ? paths : [paths];
  const processedPaths = inputPaths.map((pattern) => {
    try {
      if (fs.existsSync(pattern) && fs.statSync(pattern).isDirectory()) {
        return path.join(pattern, '**/*');
      }
    } catch (cause) {
      logger.debug(`[catGen] [paths → glob] Treating as glob: ${pattern}`, { cause });
    }
    return pattern;
  });

  const globOptions = {
    ignore: ignorePatterns,
    onlyFiles: true,
    absolute: true,
    dot: ignoreDefaultExcludes,
    suppressErrors: true,
  };

  let foundFiles = fg.sync(processedPaths, globOptions);

  const extSet = new Set(Array.isArray(extensions) ? extensions : [extensions]);
  if (!extSet.has('*')) {
    foundFiles = foundFiles.filter((filePath) => extSet.has(path.extname(filePath).toLowerCase()));
  }

  const results = foundFiles
    .map((absPath) => {
      try {
        const contents = fs.readFileSync(absPath, 'utf8');
        const relativePath = path.relative(process.cwd(), absPath);
        return { absPath, relativePath, contents };
      } catch (cause) {
        logger.warn(`[catGen] [reading → skip] ${absPath}`, { cause });
        return null;
      }
    })
    .filter((r): r is CatGenResult => r !== null);

  return results;
};
