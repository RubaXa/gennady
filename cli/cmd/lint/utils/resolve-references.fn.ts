import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/**
 * @purpose Resolved reference pair: task file path and its linked spec paths.
 */
export type ResolvedReference = {
  /** @purpose Relative path to the task file from project root */
  taskPath: string;
  /** @purpose Relative paths to spec files referenced by the task */
  specPaths: string[];
};

/**
 * @purpose Scan all task .md files in tasks/ directory and build a map of taskId -> ResolvedReference.
 * Walks the directory tree recursively, parses each task file for Task-ID and Spec References.
 * @param projectRoot Absolute path to the project root (where tasks/ lives).
 * @param taskDir Relative path to the tasks directory (default: 'tasks').
 * @returns Map from task ID string (e.g. 'TSK-21') to its ResolvedReference.
 */
export function loadTaskReferences(
  projectRoot: string,
  taskDir = 'tasks'
): Map<string, ResolvedReference> {
  const map = new Map<string, ResolvedReference>();
  const absTaskDir = resolve(projectRoot, taskDir);

  if (!existsSync(absTaskDir)) {
    return map;
  }

  const taskFiles = walkTaskFiles(absTaskDir);

  for (const absPath of taskFiles) {
    let content: string;
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    const taskIdMatch = content.match(/-\s+\*\*Task-ID:\*\*\s+(TSK-\d+)/);
    if (!taskIdMatch) continue;

    const taskId = taskIdMatch[1];
    const relTaskPath = relative(projectRoot, absPath);
    const specPaths = extractSpecReferences(content, projectRoot);

    map.set(taskId, { taskPath: relTaskPath, specPaths });
  }

  return map;
}

/**
 * @purpose Extract spec file paths from a task file's Spec References section.
 * Parses markdown links, extracts the spec filename, and searches the specs/
 * directory tree to find the actual file (no relative path resolution).
 * @param content Raw content of the task file.
 * @param projectRoot Absolute project root path.
 * @returns Deduplicated, sorted array of relative spec file paths.
 */
function extractSpecReferences(content: string, projectRoot: string): string[] {
  const specs = new Set<string>();

  const sectionMatch = content.match(/\*\*Spec References:\*\*[\s\S]*?(?=\n- \*\*|$)/);
  if (!sectionMatch) return [];

  const section = sectionMatch[0];
  const linkPattern = /\[([^\]]*)\]\(([^)]+\.md)[^)]*\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(section)) !== null) {
    // Extract just the filename from the link (last path segment)
    const filename = match[2].split('/').pop();
    if (!filename) continue;

    // Search for this filename in the specs/ directory
    const foundPath = findFileInDir(resolve(projectRoot, 'specs'), filename);
    if (foundPath) {
      const relPath = relative(projectRoot, foundPath);
      if (!relPath.startsWith('..')) {
        specs.add(relPath);
      }
    }
  }

  return [...specs].sort();
}

/**
 * @purpose Search for a file by name in a directory tree (case-sensitive).
 * Uses iterative DFS — stops at first match.
 * @param dir Absolute path to the directory to search.
 * @param targetFilename Exact filename to find.
 * @returns Absolute path if found, null otherwise.
 */
function findFileInDir(dir: string, targetFilename: string): string | null {
  if (!existsSync(dir)) return null;

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
      const fullPath = resolve(current, entry);
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          stack.push(fullPath);
        } else if (st.isFile() && entry === targetFilename) {
          return fullPath;
        }
      } catch {
        // skip
      }
    }
  }

  return null;
}

/**
 * @purpose Recursively walk a directory, returning absolute paths of all files.
 * Uses iterative stack-based traversal to avoid recursion limits.
 * @param dir Absolute directory path to walk.
 * @returns Array of absolute file paths.
 */
function walkTaskFiles(dir: string): string[] {
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
      const fullPath = resolve(current, entry);
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          stack.push(fullPath);
        } else if (st.isFile() && entry.endsWith('.md')) {
          results.push(fullPath);
        }
      } catch {
        // skip inaccessible entries
      }
    }
  }

  return results;
}

/**
 * @purpose Extract task IDs from a file's @tasks annotation in the header.
 * Parses lines like: `// @tasks: TSK-12, TSK-15`
 * @param content File content to parse.
 * @returns Array of task ID strings (e.g. ['TSK-12', 'TSK-15']), empty if no @tasks found.
 */
export function extractTaskIdsFromHeader(content: string): string[] {
  const match = content.match(/@tasks:\s*(.+)/m);
  if (!match) return [];

  return match[1]
    .split(/[,;\s]+/)
    .map((id) => id.trim())
    .filter((id) => /^TSK-\d+$/.test(id));
}

/**
 * @purpose Resolve references for a set of task IDs into deduplicated task and spec path lists.
 * @param taskIds Array of task ID strings.
 * @param taskRefMap Pre-loaded task reference map from loadTaskReferences().
 * @returns Object with deduplicated, sorted arrays of taskPaths and specPaths.
 */
export function resolveReferencesForTasks(
  taskIds: string[],
  taskRefMap: Map<string, ResolvedReference>
): { taskPaths: string[]; specPaths: string[] } {
  const taskPathSet = new Set<string>();
  const specPathSet = new Set<string>();

  for (const id of taskIds) {
    const ref = taskRefMap.get(id);
    if (!ref) continue;

    taskPathSet.add(ref.taskPath);
    for (const sp of ref.specPaths) {
      specPathSet.add(sp);
    }
  }

  return {
    taskPaths: [...taskPathSet].sort(),
    specPaths: [...specPathSet].sort(),
  };
}
