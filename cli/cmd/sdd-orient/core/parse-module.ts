// @file: Cheap module-level facts for the neighbourhood printout — entity/contract names, requirement id+title, never full bodies.
// @consumers: buildNeighbourhood

import { parseEntityRows } from '../../../../shared/sdd/inventory.ts';
import { findSpecSection } from './spec-sections.ts';

/** @purpose One contract this module declares. */
export type ModuleContract = {
  /** @purpose Contract identifier (e.g. a Port/Adapter/Service/Component/Hook name). */
  name: string;
  /** @purpose The heading's own kind word, lowercased — open-ended, not a fixed enum. */
  kind: string;
};

/** @purpose One requirement — id plus a short, truncated title (never the full body). */
export type ModuleRequirement = {
  /** @purpose Requirement id (`<ACR>-REQ-<N>` or a legacy `FR-NN`-shaped id). */
  id: string;
  /** @purpose Short, length-capped title — never the full requirement body. */
  title: string;
};

const MAX_TITLE_LEN = 80;

/**
 * @purpose Collapse whitespace, strip markdown emphasis, and cap length — the shared shrink-to-a-line
 * step both requirement-title paths need.
 * @param raw Raw multi-line or markdown-decorated text.
 * @returns A single-line, emphasis-stripped, length-capped title. Empty input stays empty.
 */
function toTitle(raw: string): string {
  const clean = raw.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE_LEN) return clean;
  return `${clean.slice(0, MAX_TITLE_LEN - 1).trimEnd()}…`;
}

/**
 * @purpose Entity names declared in a spec's Entity Inventory, either spec format.
 * @param content Full spec markdown.
 * @returns Entity names in table order; empty when no Entity Inventory section is found in either format.
 */
export function parseModuleEntities(content: string): string[] {
  const body = findSpecSection(content, 'ENTITY_INVENTORY');
  if (body === null) return [];
  return parseEntityRows(body);
}

// `#### <Kind>: \`Name\`` — Kind is open-ended (Port/Adapter/Service per DBC_PORT_FORMAT /
// DBC_ADAPTER_FORMAT, but real specs also use Component/Hook/Pattern/Utility); one word or two,
// e.g. "Value Object". Excludes plain entity headers like "#### \`Name\`" (no leading word:colon).
const CONTRACT_HEADING = /^####\s+([A-Za-z][A-Za-z ]*?):\s*`([^`]+)`/gm;

/**
 * @purpose Contract names and kind declared in a spec's Module Contracts, either spec format.
 * @invariant `#### <Kind>: \`Name\`` grammar, `Kind` open-ended — not limited to Port/Adapter/
 *   Service, since real module specs also declare Component/Hook/Pattern/Utility contracts.
 * @param content Full spec markdown.
 * @returns Contracts in document order; empty when no Module Contracts section is found.
 */
export function parseModuleContracts(content: string): ModuleContract[] {
  const body = findSpecSection(content, 'MODULE_CONTRACTS');
  if (body === null) return [];
  const out: ModuleContract[] = [];
  for (const m of body.matchAll(CONTRACT_HEADING)) {
    const kind = (m[1] ?? '').toLowerCase();
    const name = m[2];
    if (!name || !kind) continue;
    out.push({ name, kind });
  }
  return out;
}

const FLAT_REQ_HEADING = /^###[ \t]+([A-Z][A-Z0-9]*-REQ-\d+)[ \t]*\[[^\]]*\][ \t]*$/gm;
const LEGACY_ROW_ID = /^[A-Z][A-Za-z0-9-]*\d[a-z]?$/;

/**
 * @purpose Parse the flat `### <ACR>-REQ-<N> [<class>]` heading shape (REQUIREMENT_ENTRY_FORMAT).
 * @invariant Title is the following paragraph, up to the next heading or blank line.
 * @param body Requirements section body.
 * @returns Requirements via the flat heading grammar; empty when none present.
 */
function parseFlatRequirements(body: string): ModuleRequirement[] {
  const headings = [...body.matchAll(FLAT_REQ_HEADING)];
  const out: ModuleRequirement[] = [];
  for (let i = 0; i < headings.length; i++) {
    const m = headings[i];
    const id = m?.[1];
    if (!id || m.index === undefined) continue;
    const start = m.index + m[0].length;
    const next = headings[i + 1];
    const end = next?.index ?? body.length;
    const paragraph = body.slice(start, end).split(/\n\s*\n/)[0] ?? '';
    out.push({ id, title: toTitle(paragraph) });
  }
  return out;
}

/**
 * @purpose Parse the legacy split-table shape: `| ID | description |` rows (e.g. `FR-01`, `FR-ALT-02`).
 * @invariant Id matched by shape: letter, hyphen, trailing digit. A category-label row with no
 *   digit is skipped, never mistaken for a requirement.
 * @param body Requirements section body.
 * @returns Requirements via the legacy table shape; empty when none present.
 */
function parseLegacyTableRequirements(body: string): ModuleRequirement[] {
  const out: ModuleRequirement[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || /^\|[\s:|-]+$/.test(line)) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    const idCell = (cells[0] ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
    if (!LEGACY_ROW_ID.test(idCell)) continue;
    out.push({ id: idCell, title: toTitle(cells[1] ?? '') });
  }
  return out;
}

/**
 * @purpose Requirement id + short title — flat heading format, or the legacy split-table fallback.
 * @invariant Never the full requirement body — id plus a length-capped title only.
 * @param content Full spec markdown.
 * @returns Requirements in document order; empty when neither format is found.
 */
export function parseModuleRequirements(content: string): ModuleRequirement[] {
  const body =
    findSpecSection(content, 'MODULE_REQUIREMENTS') ??
    findSpecSection(content, 'REQUIREMENTS_AND_CONSTRAINTS');
  if (body === null) return [];
  const flat = parseFlatRequirements(body);
  if (flat.length > 0) return flat;
  return parseLegacyTableRequirements(body);
}
