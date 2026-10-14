// @file: Fail-closed normalization for exact repository-relative Verify Target Files.
// @consumers: target stack planners
// @spec: CLI-VERIFY

import fs from 'node:fs';
import path from 'node:path';
import { VerifyConfigError } from '../config/verify-config.error.ts';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * @purpose Normalize explicit repair operands without allowing globs, directories or symlink escape.
 * @param root Absolute repository root.
 * @param values Authored exact repo-relative paths.
 * @returns Deduplicated paths in deterministic UTF-16 code-unit order.
 */
export function normalizeTargetFiles(root: string, values: readonly string[]): readonly string[] {
  const normalizedRoot = path.resolve(root);
  const realRoot = fs.existsSync(normalizedRoot) ? fs.realpathSync(normalizedRoot) : normalizedRoot;
  const files = values.map((value, index) => {
    const keyPath = `scope.targetFiles[${index}]`;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value !== value.trim() ||
      value.includes('\\') ||
      value.includes('\0') ||
      value.endsWith('/') ||
      value.endsWith('/.') ||
      value.endsWith('/..') ||
      /[*?\[\]{}]/.test(value) ||
      path.isAbsolute(value) ||
      path.win32.isAbsolute(value)
    ) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Target File ${JSON.stringify(value)} is not an exact repo-relative path`,
        'pass a non-empty relative file path with forward slashes and no glob syntax'
      );
    }

    const absolute = path.resolve(normalizedRoot, value);
    if (!isInside(normalizedRoot, absolute)) {
      throw new VerifyConfigError(
        'VERIFY_CONFIG_INVALID_TYPE',
        keyPath,
        `Target File ${JSON.stringify(value)} escapes or names the repository root`,
        'pass an exact file contained by the repository root'
      );
    }

    const relative = path.relative(normalizedRoot, absolute);
    const segments = relative.split(path.sep);
    let current = normalizedRoot;
    let finalMetadata: fs.Stats | null = null;
    for (const [segmentIndex, segment] of segments.entries()) {
      current = path.join(current, segment);
      let metadata: fs.Stats;
      try {
        metadata = fs.lstatSync(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new VerifyConfigError(
            'VERIFY_CONFIG_INVALID_TYPE',
            keyPath,
            `Target File ${JSON.stringify(value)} does not exist`,
            'pass an existing regular non-symlink file contained by the repository root'
          );
        }
        throw error;
      }
      if (metadata.isSymbolicLink()) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `Target File ${JSON.stringify(value)} traverses a symlink`,
          'pass an exact path whose repository-relative components are not symlinks'
        );
      }
      const final = segmentIndex === segments.length - 1;
      if (!final && !metadata.isDirectory()) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `Target File ${JSON.stringify(value)} traverses a non-directory path component`,
          'pass an exact regular file below repository directories'
        );
      }
      if (final) finalMetadata = metadata;
    }

    if (finalMetadata !== null) {
      if (!finalMetadata.isFile()) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `Target File ${JSON.stringify(value)} is not a regular file`,
          'pass an exact regular file; directories and special files cannot be repair operands'
        );
      }
      const realTarget = fs.realpathSync(absolute);
      if (!isInside(realRoot, realTarget)) {
        throw new VerifyConfigError(
          'VERIFY_CONFIG_INVALID_TYPE',
          keyPath,
          `Target File ${JSON.stringify(value)} resolves outside the repository root`,
          'pass an exact regular file physically contained by the repository root'
        );
      }
    }

    return relative.split(path.sep).join('/');
  });
  return [...new Set(files)].sort(compareText);
}
