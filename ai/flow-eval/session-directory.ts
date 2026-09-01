// @file: Shared OpenCode session directory registry.
// @consumers: runtime, evidence, CLI; prevents parallel sessions crossing working trees.

import type { SddEvalSessionDirectoryRegistry } from './types.ts';

/** @purpose In-memory sessionId → cwd binding with explicit missing-session failures at consumers. */
export class SddEvalSessionDirectoryMap implements SddEvalSessionDirectoryRegistry {
  readonly #directories = new Map<string, string>();

  set(sessionId: string, directory: string): void {
    if (!sessionId || !directory) throw new Error('sessionId and directory must be non-empty');
    this.#directories.set(sessionId, directory);
  }

  get(sessionId: string): string | undefined {
    return this.#directories.get(sessionId);
  }
}
