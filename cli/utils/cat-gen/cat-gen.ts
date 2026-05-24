// @file: Collect file contents (local and VCS) for cat command.
// @consumers: cmd/cat
// @tasks: TSK-31

import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { logger } from '../../../shared/common/logger.ts';
import type { VcsMergeRequestChanges } from '../../../services/vcs-client/entities/vcs-merge-request-changes.type.ts';
import type { VcsFileContent } from '../../../services/vcs-client/entities/vcs-file-content.type.ts';

/**
 * @purpose Default file extension list for content collection (cat).
 * @consumer catGen
 */
export const DEFAULT_EXTENSIONS = ['.md', '.mdc', '.js', '.ts', '.tsx', '.go', '.sh', '.puml', '.'];

/**
 * @purpose File collection options: extensions, exclusions, disabling default exclusions.
 * @consumer catGen
 */
export type CatGenOptions = {
  /** @purpose File extensions to include (e.g. ['.ts', '.md']). */
  extensions?: string[];
  /** @purpose Patterns or paths to exclude from collection. */
  exclude?: string | string[];
  /** @purpose When true, skip default node_modules exclusion. */
  ignoreDefaultExcludes?: boolean;
};

/**
 * @purpose Single catGen result: absolute path, relative path, file contents.
 * @consumer catGen, cmd/cat
 */
export type CatGenResult = {
  /** @purpose Absolute path of the collected file. */
  absPath: string;
  /** @purpose Path relative to the working directory. */
  relativePath: string;
  /** @purpose File contents as a UTF-8 string. */
  contents: string;
};

/**
 * @purpose Get contents of all files by specified glob patterns for output in XML/MD.
 * @sideEffect Filesystem: traversal and reading of files.
 * @consumer CLI (cmd/cat)
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

/**
 * @purpose Pure function for converting VCS changes and contents into CatGenResult[].
 *         Filters deleted files and binary (encoding: base64).
 * @consumer cli/cmd/cat/cat-url.fn.ts
 */
export const catGenFromVcs = (
  changes: VcsMergeRequestChanges[],
  files: VcsFileContent[]
): CatGenResult[] => {
  const deletedSet = new Set(changes.filter((c) => c.status === 'deleted').map((c) => c.path));

  return files
    .filter((f) => !deletedSet.has(f.path) && f.encoding !== 'base64')
    .map((f) => {
      const change = changes.find((c) => c.path === f.path);
      return {
        absPath: change?.ref ? `vcs://${f.path}?ref=${change.ref}` : `vcs://${f.path}`,
        relativePath: f.path,
        contents: f.content,
      };
    });
};
