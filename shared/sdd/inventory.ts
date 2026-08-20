// @file: Parse a module spec's Entity Inventory (## 3) table into the set of declared entity names.
// @consumers: InventorySyncCheck, sdd-orient.cmd

import { extractSection } from './section.ts';

const BULLET_ENTITY_LINE = /^-\s*`([^`]+)`/;

/**
 * @purpose Extract entity names from an Entity Inventory body: the standard table, or a
 *   `- \`Name\` — Type: ...` bullet list seen in the wild.
 * @invariant Table wins when present (header/separator skipped, first column, backticks
 *   stripped); no table data rows falls back to bullets — never a silent empty result.
 * @param body Raw section body — the table/list alone, or with trailing notes/diagram.
 * @returns Declared entity names, in document order; empty when neither shape matches.
 */
export function parseEntityRows(body: string): string[] {
  const lines = body.split('\n').map((l) => l.trim());

  const tableRows = lines.filter((l) => l.startsWith('|') && !/^\|[\s:|-]+$/.test(l));
  if (tableRows.length > 1) {
    return tableRows
      .slice(1) // drop the header row (`| Name | Type | Purpose |`)
      .map((r) => (r.split('|')[1] ?? '').replace(/`/g, '').trim())
      .filter(Boolean);
  }

  return lines
    .map((l) => BULLET_ENTITY_LINE.exec(l)?.[1])
    .filter((name): name is string => Boolean(name));
}

/**
 * @purpose Extract declared entity names from a module spec's `## 3. Entity Inventory` table (first column, backticks stripped).
 * @param specContent Full module-spec markdown.
 * @returns Declared entity names; empty when there is no ENTITY_INVENTORY section.
 */
export function parseEntityInventory(specContent: string): string[] {
  const sec = extractSection(specContent, 'ENTITY_INVENTORY');
  if (sec.status !== 'ok') return [];
  return parseEntityRows(sec.content);
}
