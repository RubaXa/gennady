// @file: Render tree view of the project — S1 scenario with depth control and annotations.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile } from '../orient.types.ts';
import { relative, sep as pathSep } from 'node:path';

/**
 * @purpose Render a directory tree of scanned files with annotations and depth control.
 * @invariant Directories show `... N more dirs/dir, M files/file` when depth is exceeded.
 * @invariant Singular/plural distinction for count indicators.
 * @param files Scanned files.
 * @param projectRoot Absolute project root.
 * @param maxDepth Maximum tree depth (1-indexed).
 * @param showDetail When true, include entity details under each file.
 * @param maxResults Maximum files to show before overflow indicator.
 * @returns Array of formatted output lines.
 */
export function renderTree(
  files: ScannedFile[],
  projectRoot: string,
  maxDepth: number,
  showDetail: boolean,
  maxResults: number
): string[] {
  const lines: string[] = [];
  const tree = buildDirTree(files, projectRoot);

  renderNode(tree, '', projectRoot, maxDepth, 0, showDetail, lines);

  // #region START_MAX_RESULTS_OVERFLOW
  if (maxResults < files.length) {
    const overflow = files.length - maxResults;
    lines.push(`... ${overflow} more file${overflow === 1 ? '' : 's'}`);
  }
  // #endregion END_MAX_RESULTS_OVERFLOW

  return lines;
}

type DirNode = Map<string, DirNode | ScannedFile>;

function buildDirTree(files: ScannedFile[], projectRoot: string): DirNode {
  const root: DirNode = new Map();

  for (const file of files) {
    const relPath = relative(projectRoot, file.absPath);
    const parts = relPath.split(pathSep);
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let child = node.get(part);
      if (!child || child instanceof Map === false) {
        child = new Map() as DirNode;
        node.set(part, child);
      }
      node = child as DirNode;
    }

    node.set(parts[parts.length - 1], file);
  }

  return root;
}

function renderNode(
  node: DirNode | ScannedFile,
  indent: string,
  projectRoot: string,
  maxDepth: number,
  currentDepth: number,
  showDetail: boolean,
  lines: string[]
): void {
  if (node instanceof Map) {
    const entries = [...node.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dirs: [string, DirNode][] = [];
    const filesArr: [string, ScannedFile][] = [];

    for (const [name, child] of entries) {
      if (child instanceof Map) {
        dirs.push([name, child]);
      } else {
        filesArr.push([name, child]);
      }
    }

    // #region START_DEPTH_OVERFLOW — invariant: show indicator when maxDepth exceeded
    if (currentDepth >= maxDepth) {
      const hiddenDirs = dirs.length;
      const hiddenFiles = filesArr.length;
      const dirLabel = hiddenDirs === 1 ? 'dir' : 'dirs';
      const fileLabel = hiddenFiles === 1 ? 'file' : 'files';
      lines.push(`${indent}... ${hiddenDirs} more ${dirLabel}, ${hiddenFiles} ${fileLabel}`);
      return;
    }
    // #endregion END_DEPTH_OVERFLOW

    for (const [name, child] of dirs) {
      lines.push(`${indent}${name}/`);
      renderNode(child, `${indent}  `, projectRoot, maxDepth, currentDepth + 1, showDetail, lines);
    }

    for (const [, child] of filesArr) {
      renderNode(child, indent, projectRoot, maxDepth, currentDepth, showDetail, lines);
    }
    return;
  }

  // Render a file node
  const f = node as ScannedFile;
  const fileStr = f.header.file || '(missing)';
  const tasksStr = f.header.tasks.length > 0 ? f.header.tasks.join(', ') : '';
  const consumersStr = f.header.consumers.join(', ');
  const exportsStr = f.exports.length.toString();
  const relPath = relative(projectRoot, f.absPath);
  const fileName = relPath.split(pathSep).pop() ?? relPath;

  let line = `${indent}${fileName} — @file: ${fileStr}`;
  if (tasksStr) line += ` | @tasks: ${tasksStr}`;
  if (consumersStr) line += ` | @consumers: ${consumersStr}`;
  line += ` | @exports: ${exportsStr}`;
  lines.push(line);

  if (showDetail && f.exports.length > 0) {
    for (const exp of f.exports) {
      const purposeEntry = exp.contract.entries.find(
        (e) => e.type === 'purpose' || e.type === 'description'
      );
      if (purposeEntry) {
        lines.push(`${indent}  - ${exp.name}(${exp.kind})  ${purposeEntry.value}`);
      }
    }
  }
}
