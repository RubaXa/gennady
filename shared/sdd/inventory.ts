// @file: Parse a module spec's Entity Inventory (## 3) table into the set of declared entity names.
// @consumers: InventorySyncCheck

import { extractSection } from './section.ts';

/**
 * @purpose Extract declared entity names from a module spec's `## 3. Entity Inventory` table (first column, backticks stripped).
 * @param specContent Full module-spec markdown.
 * @returns Declared entity names; empty when there is no ENTITY_INVENTORY section.
 */
export function parseEntityInventory(specContent: string): string[] {
  const sec = extractSection(specContent, 'ENTITY_INVENTORY');
  if (sec.status !== 'ok') return [];
  const rows = sec.content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !/^\|[\s:|-]+$/.test(l));
  return rows
    .slice(1) // drop the header row (`| Name | Type | Purpose |`)
    .map((r) => (r.split('|')[1] ?? '').replace(/`/g, '').trim())
    .filter(Boolean);
}
