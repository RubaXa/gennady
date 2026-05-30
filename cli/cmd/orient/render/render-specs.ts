// @file: Render spec overview and search results — S8/S9 scenarios.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { SpecOverview } from '../orient.types.ts';

/**
 * @purpose Render a list of all specs with their task-to-file mappings.
 * @param overviews All spec overview entries.
 * @returns Array of formatted output lines.
 */
export function renderSpecsOverview(overviews: SpecOverview[]): string[] {
  const lines: string[] = [];
  if (overviews.length === 0) {
    lines.push('No specs found');
    return lines;
  }

  for (const o of overviews) {
    if (o.isLibraryLevel) {
      const subCount = o.subSpecs.length;
      lines.push(
        `${o.specPath} (library-level spec — ${subCount} sub-spec${subCount === 1 ? '' : 's'} below)`
      );
    } else {
      lines.push(`${o.specPath} → ${o.taskIds.join(', ')}`);
    }
  }

  return lines;
}

/**
 * @purpose Render a single spec's task-to-file details.
 * @param overview Single spec overview entry.
 * @returns Array of formatted output lines.
 */
export function renderSpecSearch(overview: SpecOverview): string[] {
  const lines: string[] = [];
  lines.push(`${overview.specPath}:`);
  for (const tid of overview.taskIds) {
    lines.push(`  ${tid}`);
  }
  return lines;
}
