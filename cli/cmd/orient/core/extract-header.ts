// @file: Extract file header tags (@file:, @tasks:, @consumers:) from source content.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { FileHeader } from '../orient.types.ts';

/**
 * @purpose Parse // @tag: directives from file content before the first import.
 * @invariant Scans only lines before the first `import ` statement.
 * @param content Raw file content.
 * @returns Parsed FileHeader with file, tasks, and consumers fields.
 */
export function extractHeader(content: string): FileHeader {
  const header: FileHeader = { file: '', tasks: [], consumers: [] };
  if (content.length === 0) return header;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('import ')) break;

    if (trimmed.startsWith('// @file:')) {
      header.file = trimmed.slice('// @file:'.length).trim();
    }
    if (trimmed.startsWith('// @tasks:')) {
      const raw = trimmed.slice('// @tasks:'.length);
      header.tasks = raw
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter((id) => /^TSK-\d+$/.test(id));
    }
    if (trimmed.startsWith('// @consumers:')) {
      const raw = trimmed.slice('// @consumers:'.length);
      header.consumers = raw
        .split(/[,;]+/)
        .map((n) => n.trim())
        .filter(Boolean);
    }
  }

  return header;
}
