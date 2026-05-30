// @file: Strip strings and comments from a code line — returns only braces outside string/comment contexts.
// @consumers: AnchorCheck, InvariantCountCheck, AnchorClassBodyCheck

/**
 * @purpose Strips string literals (single/double/template) and line/block comments from a source line,
 *         returning only the structural characters ({, }) for brace-depth tracking.
 * @param line Source code line.
 * @returns Line with strings and comments removed, keeping only code-level braces.
 */
export function stripStringsAndComments(line: string): string {
  let result = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1] ?? '';

    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < line.length - 1 && !(line[i] === '*' && line[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
    }

    if (ch === '\\') {
      i += 2;
      continue;
    }

    if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
      i++;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) result += ch;
    i++;
  }

  return result;
}
