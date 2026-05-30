// @file: Render keyword search results — S4 scenario with scoring and entity match info.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { KeywordMatch } from '../orient.types.ts';
import { relative } from 'node:path';

/**
 * @purpose Render keyword search results sorted by score.
 * @param matches Scored keyword matches.
 * @param projectRoot Absolute project root.
 * @returns Array of formatted output lines.
 */
export function renderSearch(matches: KeywordMatch[], projectRoot: string): string[] {
  const lines: string[] = [];

  for (const match of matches) {
    const relPath = relative(projectRoot, match.file.absPath);
    let line = `${relPath} — @file: ${match.file.header.file || '(missing)'}`;
    if (match.entityName) {
      line += ` - ${match.entityName}()  @purpose: found via entity match`;
    }
    lines.push(line);
  }

  return lines;
}
