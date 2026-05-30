// @file: Query files by task ID — S2 scenario.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile, TaskQueryResult } from '../orient.types.ts';

/**
 * @purpose Find all files tagged with the given task ID in their @tasks: header.
 * @param files All scanned project files.
 * @param taskIds One or more task IDs to search for.
 * @returns Grouped query results per task ID.
 */
export function queryTask(files: ScannedFile[], taskIds: string[]): TaskQueryResult[] {
  if (taskIds.length === 0) return [];

  const results: TaskQueryResult[] = [];

  for (const tid of taskIds) {
    const matched = files.filter((f) => f.header.tasks.includes(tid));
    results.push({ taskId: tid, files: matched });
  }

  return results;
}
