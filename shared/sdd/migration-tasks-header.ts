// @file: Read-only legacy task-header evidence parser used only by V1→V2 header migration.
// @spec: SHARED
// @consumers: migration-file-headers

import { parseSourceOwnershipHeader } from './source-ownership-header.ts';

/**
 * @purpose Parse a file's `@tasks:` header comment into its declared Task-IDs / Decision-IDs.
 * @invariant `N/A` tokens are dropped (they mean "no id yet"); everything else is kept verbatim, in header order.
 * @param content Full file source (any single-line comment style: `//`, `#`).
 * @returns Declared ids; empty when the header lists only `N/A` or is absent.
 */
export function parseTasksHeader(content: string): string[] {
  const values = parseSourceOwnershipHeader(content)
    .blocks.filter((block) => block.tag === 'tasks')
    .map((block) => block.value);
  return values
    .flatMap((value) => value.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^n\/a$/i.test(s));
}
