// @file: Render detailed file view — S5 scenario with full DBC contracts and method listing.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile } from '../orient.types.ts';
import type { DbcEntrySchema } from '../../../../services/dbc/parser/dbc-parser.types.ts';
import { relative } from 'node:path';

/**
 * @purpose Render a detailed view of one or more files with full DBC contracts.
 * @invariant Renders file header block, then each exported entity with all DBC tags.
 * @invariant Functions show signatures; classes show methods.
 * @param files Scanned files to render in detail.
 * @param projectRoot Absolute project root.
 * @returns Array of formatted output lines.
 */
export function renderDetail(files: ScannedFile[], projectRoot: string): string[] {
  const lines: string[] = [];

  for (const file of files) {
    const relPath = relative(projectRoot, file.absPath);
    lines.push(relPath);
    lines.push(`  @file: ${file.header.file || '(missing)'}`);

    if (file.header.tasks.length > 0) {
      lines.push(`  @tasks: ${file.header.tasks.join(', ')}`);
    }

    if (file.header.consumers.length > 0) {
      lines.push(`  @consumers: ${file.header.consumers.join(', ')}`);
    }

    lines.push(`  @exports: ${file.exports.length}`);

    if (file.exports.length > 0) {
      lines.push('');
      for (const exp of file.exports) {
        const sig = formatEntitySignature(exp.name, exp.kind, exp.contract);
        lines.push(`  ${sig}`);
        renderContractEntries(exp.contract.entries, lines, '    ');
        lines.push('');
      }
    }
  }

  return lines;
}

function formatEntitySignature(
  name: string,
  kind: string,
  contract: { entries: DbcEntrySchema[] }
): string {
  if (kind === 'function') {
    const params = contract.entries
      .filter((e) => e.type === 'param')
      .map((p) => p.specifier ?? '?')
      .join(', ');
    const returns = contract.entries.find((e) => e.type === 'returns');
    const retStr = returns ? `: ${returns.dataType ?? returns.value}` : ': void';
    return `${name}(${params})${retStr}`;
  }

  return `${name}: ${kind}`;
}

function renderContractEntries(entries: DbcEntrySchema[], lines: string[], indent: string): void {
  for (const entry of entries) {
    if (entry.type === 'description') continue;
    let line = `${indent}@${entry.type}`;
    if (entry.specifier) line += ` {${entry.specifier}}`;
    if (entry.dataType) line += ` {${entry.dataType}}`;
    if (entry.value) line += ` ${entry.value}`;
    lines.push(line);

    if (entry.inline) {
      for (const ine of entry.inline) {
        let il = `${indent}  @${ine.type}`;
        if (ine.specifier) il += ` {${ine.specifier}}`;
        if (ine.dataType) il += ` {${ine.dataType}}`;
        if (ine.value) il += ` ${ine.value}`;
        lines.push(il);
      }
    }
  }
}
