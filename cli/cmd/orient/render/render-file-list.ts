// @file: Render universal file list line format — `path — @file: ... | @tasks: ... | @consumers: ... | @exports: N`.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile } from '../orient.types.ts';
import { relative } from 'node:path';

/**
 * @purpose Format a single file line in universal format.
 * @param file Scanned file with header and exports.
 * @param projectRoot Absolute project root for relative path display.
 * @returns Formatted line string.
 */
export function renderFileLine(file: ScannedFile, projectRoot: string): string {
  const relPath = relative(projectRoot, file.absPath);
  const fileStr = file.header.file || '(missing)';
  const tasksStr = file.header.tasks.length > 0 ? file.header.tasks.join(', ') : '';
  const consumersStr = file.header.consumers.join(', ');
  const exportsStr = file.exports.length.toString();

  // #region START_BUILD_LINE — invariant: universal format with | separator
  let line = `${relPath} — @file: ${fileStr}`;
  if (tasksStr) line += ` | @tasks: ${tasksStr}`;
  if (consumersStr) line += ` | @consumers: ${consumersStr}`;
  line += ` | @exports: ${exportsStr}`;
  return line;
  // #endregion END_BUILD_LINE
}

/**
 * @purpose Render a list of files in universal format.
 * @param files Scanned files to render.
 * @param projectRoot Absolute project root for relative path display.
 * @returns Array of formatted lines.
 */
export function renderFileList(files: ScannedFile[], projectRoot: string): string[] {
  return files.map((f) => renderFileLine(f, projectRoot));
}
