// @file: Canonical parser for leading source ownership headers shared by V1 compatibility and V2 migration.
// @spec: SHARED
// @consumers: tasks-append-only, migration-file-headers

/** @purpose Canonical ownership tags supported in source-file headers. */
export type SourceOwnershipTag = 'file' | 'spec' | 'tasks' | 'consumers';

/** @purpose One canonical ownership block: tag line plus byte-preserved continuation comments. */
export type SourceOwnershipBlock = {
  /** @purpose Parsed ownership tag. */
  tag: SourceOwnershipTag;
  /** @purpose Source-language line-comment prefix. */
  prefix: '//' | '#';
  /** @purpose Zero-based first line index. */
  start: number;
  /** @purpose Exclusive zero-based end line index. */
  end: number;
  /** @purpose Inline value after the tag. */
  value: string;
  /** @purpose Original tag and continuation lines. */
  lines: string[];
};

/** @purpose Parsed canonical leading source ownership header and any unsafe lookalikes. */
export type ParsedSourceOwnershipHeader = {
  /** @purpose Canonical ownership blocks in source order. */
  blocks: SourceOwnershipBlock[];
  /** @purpose Ownership-shaped tags outside the canonical leading region. */
  bodyTagIndexes: number[];
  /** @purpose Non-continuation comments interleaved between ownership blocks. */
  ambiguousHeaderIndexes: number[];
};

const TAG = /^\s*(\/\/|#)\s*@(file|spec|tasks|consumers):\s*(.*)$/;

function isLineComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || /^#(?:\s|@|$)/.test(trimmed);
}

function consumeBlockComment(lines: readonly string[], start: number): number {
  const first = (lines[start] ?? '').trim();
  if (!first.startsWith('/*') || first.startsWith('/**')) return start;
  let index = start;
  while (index < lines.length) {
    if ((lines[index] ?? '').includes('*/')) return index + 1;
    index += 1;
  }
  return lines.length;
}

/**
 * @purpose Parse only the canonical leading ownership header, never ownership-shaped prose in a
 *   declaration body.
 * @invariant Shebang, blanks and license comments may precede the first tag; declaration JSDoc,
 *   block comments, blanks or source statements after ownership starts terminate the header.
 * @invariant Tag lines outside the canonical region are reported but never interpreted as header
 *   evidence. Original continuation bytes and `//`/`#` prefixes are preserved in each block.
 * @param content Full source-file text.
 * @returns Parsed leading blocks plus body/ambiguous line indexes for fail-closed callers.
 */
export function parseSourceOwnershipHeader(content: string): ParsedSourceOwnershipHeader {
  const lines = content.split(/\r?\n/);
  let index = 0;
  if ((lines[0] ?? '').trim().startsWith('#!')) index = 1;

  // Prelude is deliberately bounded to the leading comment area. A block comment here is a
  // license; once ownership starts, the next block comment is declaration documentation.
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (TAG.test(line)) break;
    if (line.trim() === '' || isLineComment(line)) {
      index += 1;
      continue;
    }
    const afterBlock = consumeBlockComment(lines, index);
    if (afterBlock !== index) {
      index = afterBlock;
      continue;
    }
    break;
  }

  const blocks: SourceOwnershipBlock[] = [];
  const ambiguousHeaderIndexes: number[] = [];
  let headerEnd = index;
  let sawTag = false;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const match = TAG.exec(line);
    if (match) {
      sawTag = true;
      const prefix = match[1] as '//' | '#';
      const tag = match[2] as SourceOwnershipTag;
      const start = index;
      index += 1;
      const escapedPrefix = prefix === '//' ? '\\/\\/' : '#';
      const continuation = new RegExp(`^\\s*${escapedPrefix}[ \\t]{2,}.*$`);
      const blankComment = new RegExp(`^\\s*${escapedPrefix}[ \\t]*$`);
      while (index < lines.length) {
        if (continuation.test(lines[index] ?? '')) {
          index += 1;
          continue;
        }
        if (blankComment.test(lines[index] ?? '')) {
          let next = index;
          while (next < lines.length && blankComment.test(lines[next] ?? '')) next += 1;
          if (continuation.test(lines[next] ?? '')) {
            index = next;
            continue;
          }
        }
        break;
      }
      blocks.push({
        tag,
        prefix,
        start,
        end: index,
        value: match[3] ?? '',
        lines: lines.slice(start, index),
      });
      headerEnd = index;
      continue;
    }
    if (!sawTag) break;
    if (line.trim() === '' || line.trim().startsWith('/*') || !isLineComment(line)) break;
    ambiguousHeaderIndexes.push(index);
    index += 1;
    headerEnd = index;
  }

  const bodyTagIndexes: number[] = [];
  for (let bodyIndex = headerEnd; bodyIndex < lines.length; bodyIndex += 1) {
    if (TAG.test(lines[bodyIndex] ?? '')) bodyTagIndexes.push(bodyIndex);
  }
  return { blocks, bodyTagIndexes, ambiguousHeaderIndexes };
}
