// @file: Port + fs adapter for reading a spec/portal file's content by path — the one point of variability tests substitute (AX_PORTS_AND_ABSTRACTIONS_DISCIPLINE).
// @consumers: buildNeighbourhood, SddOrientCommand

import { readFileSync } from 'node:fs';

/**
 * @purpose Read one file's content by absolute path.
 */
export type SpecSectionSource = {
  /**
   * @purpose Read a file's content.
   * @param path Absolute file path.
   * @returns The file's content, or null when it cannot be read (missing, EACCES, not a file).
   */
  read(path: string): string | null;
};

/**
 * @purpose Real-filesystem SpecSectionSource — reads spec and portal files via `readFileSync`.
 * @invariant Never throws — a missing or unreadable file reads as null, same as a fixture would report absence.
 */
export const fsSpecSectionSource: SpecSectionSource = {
  read(path: string): string | null {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  },
};
