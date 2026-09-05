// @file: Markdown table row lexer shared by strict SDD section parsers.
// @consumers: ticket
// @tasks: N/A

/** @purpose Count the consecutive backticks that begin at one byte offset. */
function backtickRun(value: string, start: number): number {
  let end = start;
  while (value[end] === '`') end += 1;
  return end - start;
}

/**
 * @purpose Split one markdown table row without treating escaped or inline-code pipes as separators.
 * @param line Exact source row.
 * @returns Trimmed cells, preserving markdown escapes and code wrappers for the caller.
 */
export function lexMarkdownTableRow(
  line: string
): { ok: true; cells: string[] } | { ok: false; issue: string } {
  const source = line.trim();
  const cells: string[] = [];
  let cell = '';
  let codeDelimiter = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      let run = 1;
      while (source[index + run] === '\\') run += 1;
      cell += '\\'.repeat(run);
      index += run - 1;
      if (run % 2 === 1 && source[index + 1] === '|') {
        cell += '|';
        index += 1;
      }
      continue;
    }
    if (char === '`') {
      const run = backtickRun(source, index);
      if (codeDelimiter === 0) codeDelimiter = run;
      else if (codeDelimiter === run) codeDelimiter = 0;
      cell += '`'.repeat(run);
      index += run - 1;
      continue;
    }
    if (char === '|' && codeDelimiter === 0) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  if (codeDelimiter !== 0)
    return { ok: false, issue: `unterminated ${'`'.repeat(codeDelimiter)} code span` };
  cells.push(cell.trim());

  if (source.startsWith('|') && cells[0] === '') cells.shift();
  if (source.endsWith('|') && cells.at(-1) === '') cells.pop();
  return { ok: true, cells };
}

/**
 * @purpose Decode the markdown escape that makes a literal pipe safe inside a table cell.
 * @param value Exact lexed cell value.
 * @returns Cell bytes with only markdown pipe escapes decoded.
 */
export function unescapeMarkdownTablePipes(value: string): string {
  return value.replace(/\\\|/g, '|');
}
