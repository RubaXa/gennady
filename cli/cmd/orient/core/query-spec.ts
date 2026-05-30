// @file: Query spec files — S8/S9 scenarios for spec overview and spec search.
// @consumers: OrientCommand
// @tasks: TSK-55

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';
import type { SpecOverview } from '../orient.types.ts';

/**
 * @purpose Scan specs/ directory and build overview of spec files with their task references.
 * @invariant Recursively walks specs/, parses task files to link specs to task IDs.
 * @param projectRoot Absolute project root path.
 * @returns Array of SpecOverview entries.
 */
export function loadSpecOverview(projectRoot: string): SpecOverview[] {
  const specsDir = resolve(projectRoot, 'specs');
  if (!existsSync(specsDir)) return [];

  const specFiles = walkSpecFiles(specsDir);
  const overviews: SpecOverview[] = [];

  for (const specPath of specFiles) {
    const relPath = relative(projectRoot, specPath);
    let content: string;
    try {
      content = readFileSync(specPath, 'utf-8');
    } catch {
      continue;
    }

    const taskIds = extractTaskIdsFromSpec(content);

    const isLibraryLevel = taskIds.length === 0;
    const overview: SpecOverview = {
      specPath: relPath,
      taskIds,
      isLibraryLevel,
      subSpecs: [],
    };

    if (isLibraryLevel) {
      overview.subSpecs = findSubSpecs(specPath, specsDir);
    }

    overviews.push(overview);
  }

  return overviews;
}

function walkSpecFiles(dir: string): string[] {
  const results: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = resolve(current, entry);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.endsWith('.spec.md')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function extractTaskIdsFromSpec(content: string): string[] {
  const ids = new Set<string>();
  const regex = /TSK-\d+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    ids.add(match[0]);
  }
  return [...ids].sort();
}

function findSubSpecs(specPath: string, specsDir: string): string[] {
  const specDir = resolve(specPath, '..');
  if (!specDir.startsWith(specsDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(specDir);
  } catch {
    return [];
  }

  return entries
    .filter((e) => e !== basename(specPath) && e.endsWith('.spec.md'))
    .map((e) => resolve(specDir, e))
    .filter((e) => e !== specPath)
    .sort();
}

/**
 * @purpose Search for a specific spec file by name and return its tasks-to-files mapping.
 * @param projectRoot Absolute project root path.
 * @param specName Spec file name to search for.
 * @returns Spec overview entry or null if not found.
 */
export function searchSpec(projectRoot: string, specName: string): SpecOverview | null {
  const overviews = loadSpecOverview(projectRoot);
  return overviews.find((o) => o.specPath.endsWith(specName)) ?? null;
}
