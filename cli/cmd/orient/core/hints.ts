// @file: Hint generation — up to 4 contextual hints for each orient output mode.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { OrientArgs } from '../orient.types.ts';

/**
 * @purpose Generate up to 4 contextual hints based on the current query mode.
 * @invariant Hints use the syntax `<cmd> --flag=<value>` or `--flag`.
 * @invariant `<cmd>` is replaced with `orient`.
 * @param args Parsed CLI arguments.
 * @returns Array of hint strings (max 4).
 */
export function generateHints(args: OrientArgs): string[] {
  const hints: string[] = [];

  if (args.file.length > 0) {
    return [
      `orient --detail                show DBC contracts for each entity in this file`,
      `orient --task=TSK-XX --detail   find files by task, then show their contracts`,
    ];
  }

  if (args.task.length > 0) {
    hints.push(`orient --task=<TID> --detail    show DBC contracts for matched files`);
    hints.push(`orient --consumer=<name>        find files by consumer name`);
    hints.push(`orient --entity=<name>          search for a specific exported entity`);
    hints.push(`orient --specs                  see all specs and their task files`);
    return hints.slice(0, 4);
  }

  if (args.consumer.length > 0) {
    hints.push(`orient --consumer=<name> --detail  show contracts`);
    hints.push(`orient --graph                  show the full dependency graph`);
    hints.push(`orient --graph --recursive      show transitive dependencies`);
    return hints;
  }

  if (args.entity.length > 0) {
    hints.push(`orient --entity=<name> --fuzzy   fuzzy match entity names`);
    hints.push(`orient --file=<path>             inspect a specific file in detail`);
    return hints;
  }

  if (args.graph) {
    hints.push(`orient --graph --recursive      expand transitive dependencies`);
    hints.push(`orient --graph --recursive --depth=<N>  limit recursion depth`);
    hints.push(`orient --consumer=<name>        find files by consumer`);
    return hints;
  }

  if (args.specs || args.spec) {
    hints.push(`orient --task=TSK-XX             find files for a specific task`);
    hints.push(`orient --file=<path>             detailed view of a file`);
    return hints;
  }

  if (args._.length > 0) {
    hints.push(`orient --detail                 include DBC contract details`);
    hints.push(`orient --task=TSK-XX             find all files for a task`);
    hints.push(`orient --entity=<name>           search exported entities`);
    hints.push(`orient --file=<path>             detailed view of a single file`);
    return hints.slice(0, 4);
  }

  // Default map mode
  hints.push(`orient --depth=<N>              limit tree depth`);
  hints.push(`orient --detail                 show DBC contracts per file`);
  hints.push(`orient --task=TSK-XX             find files by task ID`);
  hints.push(`orient <keyword>                 search across all @file: and @purpose`);
  return hints.slice(0, 4);
}
