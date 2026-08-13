// @file: Count module-classified spec files under specs/ — the MODULE_VISION marker, mirroring check.ts's classifier.
// @consumers: sdd-state.cmd
// @tasks: N/A

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

/** @purpose Directory names never descended into while walking specs/. */
const SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * @purpose Recursively count `.spec.md` files under a specs/ tree that carry the MODULE_VISION marker.
 * @invariant Read-only; a scope spec (SCOPE_TYPE, no MODULE_VISION) or the portal (README.md) is not counted.
 * @param specsDir Absolute path to the project's specs/ directory.
 * @returns Count of module-classified spec files; 0 when specsDir is absent or holds none.
 */
export function countModuleSpecs(specsDir: string): number {
  let count = 0;

  function walk(dir: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith('.spec.md')) {
        try {
          const content = readFileSync(join(dir, entry.name), 'utf-8');
          if (content.includes('<!--SECTION:MODULE_VISION-->')) count++;
        } catch {
          // unreadable file — not counted
        }
      }
    }
  }

  walk(specsDir);
  return count;
}
