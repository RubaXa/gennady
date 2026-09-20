// @file: Extract file header tags (@file:, V2 @spec:, legacy @tasks:, @consumers:) from source content.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { FileHeader } from '../orient.types.ts';
import { looksLikeTaskId } from '../../../../shared/sdd/task-id.ts';
import { isCanonicalSpecId } from '../../../../shared/sdd/spec-id.ts';

/**
 * @purpose Parse // @tag: directives from file content before the first import.
 * @invariant Scans only lines before the first `import ` statement.
 * @param content Raw file content.
 * @returns Parsed FileHeader with file, canonical spec, legacy tasks, and consumers fields.
 */
export function extractHeader(content: string): FileHeader {
  const header: FileHeader = { file: '', spec: '', specCount: 0, tasks: [], consumers: [] };
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
        .filter(looksLikeTaskId);
    }
    if (trimmed.startsWith('// @spec:')) {
      const id = trimmed.slice('// @spec:'.length).trim();
      header.specCount = (header.specCount ?? 0) + 1;
      header.spec = header.specCount === 1 && isCanonicalSpecId(id) ? id : '';
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
