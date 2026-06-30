// @file: Pure parsers for SDD ticket sections (Meta, Phases Overview, phase bodies, Verification) — shared by sdd-task/sdd-check.
// @consumers: sdd-task.cmd
// @tasks: N/A

/** @purpose One Spec Reference entry from Meta. */
export type SpecRef = {
  /** @purpose Role label (Contract / Adapter / Consumer / …), or empty if the bullet had none. */
  role: string;
  /** @purpose Linked entity name (the link text). */
  name: string;
  /** @purpose Link target (spec anchor / path). */
  anchor: string;
};

/** @purpose Parsed Meta planning fields of a ticket. */
export type MetaInfo = {
  /** @purpose Task-ID (`<ACR>-<slug>`) or null. */
  taskId: string | null;
  /** @purpose Status token (e.g. `[x] DONE`) or null. */
  status: string | null;
  /** @purpose One-line purpose, or null. */
  purpose: string | null;
  /** @purpose Owning scope, or null. */
  scope: string | null;
  /** @purpose Owning module, or null. */
  module: string | null;
  /** @purpose Dependency Task-IDs (empty when None). */
  dependencies: string[];
  /** @purpose Spec References — the enumerable contract set. */
  specRefs: SpecRef[];
};

/** @purpose One row of the Phases Overview table. */
export type PhaseOverview = {
  /** @purpose Phase id (e.g. P1). */
  id: string;
  /** @purpose Phase kind (bootstrap/impl/test/config/doc/refactor). */
  kind: string;
  /** @purpose Phase dependency ids (empty when —). */
  deps: string[];
  /** @purpose Status flag cell (e.g. `[ ]`). */
  status: string;
};

/** @purpose Parsed body of one phase section. */
export type PhaseDetail = {
  /** @purpose One-line objective, or null. */
  objective: string | null;
  /** @purpose Rule links (markdown link targets) the phase activates. */
  rules: string[];
  /** @purpose Target file paths the phase may write. */
  targetFiles: string[];
  /** @purpose Inputs line (e.g. `none`, `P1 handoff`), or null. */
  inputs: string | null;
  /** @purpose Exit criterion, or null. */
  exit: string | null;
};

/** @purpose One Verification gate row. */
export type Gate = {
  /** @purpose The resolved check command. */
  command: string;
  /** @purpose Rule-ids that require this gate. */
  requiredBy: string[];
};

/** @purpose Extract the inline value after a `- **Label:**` field, or null. */
function inlineField(body: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`);
  const m = body.match(re);
  return m?.[1]?.trim() ?? null;
}

/** @purpose Collect the `- ` sub-bullets that follow a `**Label:**` line, until the next bold field or dedent. */
function bulletsUnder(body: string, label: string): string[] {
  const lines = body.split('\n');
  const out: string[] = [];
  let active = false;
  for (const line of lines) {
    const boldField = /^\s*-?\s*\*\*([^:*]+):\*\*/.exec(line);
    if (boldField) {
      active = boldField[1]?.trim().toLowerCase() === label.toLowerCase();
      continue;
    }
    if (!active) continue;
    if (line.trim() === '') continue;
    if (/^\s*-\s+/.test(line)) out.push(line.trim().replace(/^-\s+/, '').trim());
    else break;
  }
  return out;
}

/** @purpose Pull the link text + target from a markdown link, or treat the whole string as the name. */
function parseLink(s: string): { name: string; anchor: string } {
  const m = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (m && m[1] && m[2]) return { name: m[1], anchor: m[2] };
  return { name: s.trim(), anchor: '' };
}

/**
 * @purpose Parse the planning fields of a ticket Meta section.
 * @param metaBody Text between the META markers.
 * @returns A MetaInfo; absent fields are null / empty.
 */
export function parseMetaInfo(metaBody: string): MetaInfo {
  const taskId = metaBody.match(/\*\*Task-ID:\*\*\s*`?([A-Za-z0-9][\w-]*)`?/)?.[1] ?? null;
  const status = metaBody.match(/\*\*Status:\*\*\s*(\[.\]\s*[A-Z_]+)/)?.[1] ?? null;
  const depsRaw = inlineField(metaBody, 'Dependencies');
  const dependencies =
    !depsRaw || /^none$/i.test(depsRaw.trim())
      ? []
      : depsRaw.split(',').map((d) => d.trim()).filter(Boolean);

  const specRefs = bulletsUnder(metaBody, 'Spec References').map((b) => {
    const colon = b.indexOf(':');
    const hasRole = colon !== -1 && colon < b.indexOf('[');
    const role = hasRole ? b.slice(0, colon).trim() : '';
    const { name, anchor } = parseLink(hasRole ? b.slice(colon + 1) : b);
    return { role, name, anchor };
  });

  return {
    taskId,
    status,
    purpose: inlineField(metaBody, 'Purpose'),
    scope: inlineField(metaBody, 'Scope'),
    module: inlineField(metaBody, 'Module'),
    dependencies,
    specRefs,
  };
}

/** @purpose Split a markdown table row into trimmed content cells. */
function rowCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** @purpose True for a table separator row like `|---|---|`. */
function isSeparator(line: string): boolean {
  return /^\|?\s*:?-{2,}/.test(line.trim());
}

/**
 * @purpose Parse the Phases Overview table.
 * @param body Text of the PHASES_OVERVIEW section.
 * @returns One PhaseOverview per data row.
 */
export function parsePhasesOverview(body: string): PhaseOverview[] {
  const out: PhaseOverview[] = [];
  for (const line of body.split('\n')) {
    if (!line.trimStart().startsWith('|') || isSeparator(line)) continue;
    const cells = rowCells(line);
    if (cells.length < 4 || cells[0]?.toLowerCase() === 'id') continue;
    const [id, kind, deps, status] = cells;
    if (!id) continue;
    out.push({
      id,
      kind: kind ?? '',
      deps: !deps || deps === '—' ? [] : deps.split(',').map((d) => d.trim()).filter(Boolean),
      status: status ?? '',
    });
  }
  return out;
}

/**
 * @purpose Parse one phase section body into its planning fields.
 * @param phaseBody Text between a PHASE_P<n> marker pair.
 * @returns The PhaseDetail (objective, rule links, target files, inputs, exit).
 */
export function parsePhaseDetail(phaseBody: string): PhaseDetail {
  return {
    objective: inlineField(phaseBody, 'Objective'),
    rules: bulletsUnder(phaseBody, 'Rules').map((b) => parseLink(b).anchor || parseLink(b).name),
    targetFiles: bulletsUnder(phaseBody, 'Target Files').map((b) => b.replace(/[`*]/g, '').trim()),
    inputs: inlineField(phaseBody, 'Inputs'),
    exit: inlineField(phaseBody, 'Exit'),
  };
}

/**
 * @purpose Parse the Verification gate table.
 * @param body Text of the VERIFICATION section.
 * @returns One Gate per command row.
 */
export function parseVerification(body: string): Gate[] {
  const out: Gate[] = [];
  for (const line of body.split('\n')) {
    if (!line.trimStart().startsWith('|') || isSeparator(line)) continue;
    const cells = rowCells(line);
    if (cells.length < 2 || cells[0]?.toLowerCase() === 'command') continue;
    const [command, requiredBy] = cells;
    if (!command) continue;
    out.push({
      command: command.replace(/`/g, '').trim(),
      requiredBy: (requiredBy ?? '').split(',').map((r) => r.trim()).filter(Boolean),
    });
  }
  return out;
}
