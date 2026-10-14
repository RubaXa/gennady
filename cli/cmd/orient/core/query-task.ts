// @file: Query files by task ID — S2 scenario.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import type { ScannedFile, TaskQueryResult } from '../orient.types.ts';
import type { FileRelationsResult } from '../../../../shared/sdd/file-relations.types.ts';

/**
 * @purpose Find resolver-backed task relations, keeping legacy header matches separate as migration evidence.
 * @param files All scanned project files.
 * @param taskIds One or more task IDs to search for.
 * @param [relations] Canonical file-relations evidence keyed by absolute file path.
 * @returns Grouped query results per task ID.
 */
export function queryTask(
  files: ScannedFile[],
  taskIds: string[],
  relations: ReadonlyMap<string, FileRelationsResult> = new Map()
): TaskQueryResult[] {
  if (taskIds.length === 0) return [];

  const results: TaskQueryResult[] = [];

  for (const tid of taskIds) {
    const matched = files.filter((f) => {
      const resolved = relations.get(f.absPath);
      return (
        resolved?.flow === 'v2' &&
        [...resolved.planned, ...resolved.active, ...resolved.blocked, ...resolved.history].some(
          (relation) => relation.taskId === tid
        )
      );
    });
    const migrationFiles = files.filter((f) => f.header.tasks.includes(tid));
    results.push({ taskId: tid, files: matched, migrationFiles });
  }

  return results;
}
