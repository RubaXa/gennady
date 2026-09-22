// @file: Extract file header tags (@file:, V2 @spec:, legacy @tasks:, @consumers:) from source content.
// @spec: CLI-ORIENT
// @consumers: OrientCommand

import type { FileHeader } from '../orient.types.ts';
import { looksLikeTaskId } from '../../../../shared/sdd/task-id.ts';
import { isCanonicalSpecId } from '../../../../shared/sdd/spec-id.ts';

/**
 * @purpose Parse `//` or `#` @tag directives from file content before the first import.
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

    const tag = /^(?:\/\/|#)\s*@(file|tasks|spec|consumers):\s*(.*)$/.exec(trimmed);
    if (!tag) continue;
    const kind = tag[1];
    const raw = tag[2] ?? '';
    if (kind === 'file') header.file = raw.trim();
    if (kind === 'tasks') {
      header.tasks = raw
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(looksLikeTaskId);
    }
    if (kind === 'spec') {
      const id = raw.trim();
      header.specCount = (header.specCount ?? 0) + 1;
      header.spec = header.specCount === 1 && isCanonicalSpecId(id) ? id : '';
    }
    if (kind === 'consumers') {
      header.consumers = raw
        .split(/[,;]+/)
        .map((n) => n.trim())
        .filter(Boolean);
    }
  }

  return header;
}
