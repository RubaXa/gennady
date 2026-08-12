// @file: Parse a ticket Meta and surgically update a tracker-table Status cell by Task-ID — pure, shared.
// @consumers: sdd-sync.cmd
// @tasks: N/A

/**
 * @purpose Task-ID and Status read from a ticket Meta section.
 * @invariant Either field is null when its Meta line is absent or unparseable.
 */
export type TicketMeta = {
  /** @purpose Task-ID (`<ACR>-<slug>`) from the Meta section, or null if absent. */
  taskId: string | null;
  /** @purpose Status token (e.g. `[x] DONE`) from the Meta section, or null if absent. */
  status: string | null;
};

/**
 * @purpose Outcome of a tracker Status-cell update.
 * @invariant `ok` carries the (possibly unchanged) text and whether a byte changed; failures name why no row was touched.
 */
export type TrackerUpdate =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; reason: 'no_table' | 'task_not_found' };

/**
 * @purpose Extract Task-ID and Status from a ticket Meta section body.
 * @invariant Tolerant of both v2 bold (`**Task-ID:**`) and unmarked v1 (`- Task-ID:`) Meta lines — a
 *   v1 ticket must never silently parse as null.
 * @param metaBody The text between the META markers.
 * @returns TicketMeta with each field parsed or null.
 */
export function parseMeta(metaBody: string): TicketMeta {
  const idMatch = metaBody.match(/\*{0,2}Task-ID:\*{0,2}\s*`?([A-Za-z0-9][A-Za-z0-9_-]*)`?/);
  const statusMatch = metaBody.match(/\*{0,2}Status:\*{0,2}\s*(\[.\]\s*[A-Z_]+)/);
  return {
    taskId: idMatch?.[1] ?? null,
    status: statusMatch?.[1] ?? null,
  };
}

/** @purpose Strip backticks and markdown-link wrapping from a table cell, returning its plain id text. */
function cellText(cell: string): string {
  return cell
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

/** @purpose Split a markdown table row into trimmed content cells (leading/trailing pipes dropped). */
function contentCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * @purpose Surgically set the Status cell of the tracker row whose Task-ID matches, leaving other cells byte-identical.
 * @invariant Locates columns by header (`Task-ID` / `Status`) — never by fixed index, since module vs scope trackers differ.
 * @invariant Only the matched row's Status segment is rewritten; all other rows and cells are untouched.
 * @param content Full markdown of an index file.
 * @param taskId Task-ID to match (compared against the link/backtick-stripped cell).
 * @param newStatus Status token to write (e.g. `[x] DONE`).
 * @returns ok with the updated text and whether it changed, or a failure reason (no tracker table / row not found).
 */
export function updateTrackerStatus(
  content: string,
  taskId: string,
  newStatus: string
): TrackerUpdate {
  const lines = content.split('\n');

  const header = findTaskStatusHeader(lines);
  if (!header) return { ok: false, reason: 'no_table' };
  const { headerIdx, idCol, statusCol } = header;

  // #region START_UPDATE_ROW — invariant: scan data rows after the separator; rewrite only the Status segment
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (!line.trimStart().startsWith('|')) break; // table ended
    const cells = contentCells(line);
    if (/^\|?\s*-+\s*\|/.test(line)) continue; // separator row
    if (cellText(cells[idCol] ?? '') !== taskId) continue;

    // raw split keeps original spacing; content cell c lives at raw[c+1] for a leading-pipe row
    const raw = line.split('|');
    const target = statusCol + 1;
    if (raw[target] === undefined) return { ok: false, reason: 'no_table' };
    const before = raw[target];
    raw[target] = ` ${newStatus} `;
    if (raw[target] === before) return { ok: true, text: content, changed: false };
    lines[i] = raw.join('|');
    return { ok: true, text: lines.join('\n'), changed: true };
  }
  // #endregion END_UPDATE_ROW

  return { ok: false, reason: 'task_not_found' };
}

/** @purpose One Tracker-Index row reduced to the fields the cross-check needs. */
export type TrackerRow = {
  /** @purpose Task-ID from the row's Task-ID cell (link/backtick-stripped). */
  taskId: string;
  /** @purpose Status cell text (e.g. `[x] DONE`), whitespace-trimmed. */
  status: string;
};

/**
 * @purpose Locate the tracker table header carrying both `Task-ID` and `Status` columns.
 * @param lines The index file split into lines.
 * @returns The header row index + the two column indices, or null when no such table exists.
 */
function findTaskStatusHeader(
  lines: string[]
): { headerIdx: number; idCol: number; statusCol: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trimStart().startsWith('|')) continue;
    const cells = contentCells(line).map((c) => c.toLowerCase());
    const idCol = cells.indexOf('task-id');
    const statusCol = cells.indexOf('status');
    if (idCol !== -1 && statusCol !== -1) return { headerIdx: i, idCol, statusCol };
  }
  return null;
}

/**
 * @purpose Read the Tracker-Index rows of an index file — the read-only counterpart to updateTrackerStatus.
 * @param content Full markdown of a `*.3-tasks.md` index file.
 * @returns One TrackerRow per data row; empty when the file has no Task-ID/Status table.
 */
export function parseTrackerRows(content: string): TrackerRow[] {
  const lines = content.split('\n');
  const header = findTaskStatusHeader(lines);
  if (!header) return [];
  const rows: TrackerRow[] = [];
  for (let i = header.headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trimStart().startsWith('|')) break;
    if (/^\|?\s*-+\s*\|/.test(line)) continue;
    const cells = contentCells(line);
    const taskId = cellText(cells[header.idCol] ?? '');
    if (taskId) rows.push({ taskId, status: (cells[header.statusCol] ?? '').trim() });
  }
  return rows;
}

/**
 * @purpose True when a TrackerRow's Status cell is a `[x]` checkbox (case-insensitive) — done.
 * @param status The Status cell text.
 * @returns Whether the row is done.
 */
export function isRowDone(status: string): boolean {
  return /^\[x\]/i.test(status.trim());
}

/**
 * @purpose Locate a Scope/Module rollup table — carries `Index`, `Tasks`, AND `Done` columns.
 * @param lines The index file split into lines.
 * @returns Header row index + the three column indices, or null when no such table exists.
 */
function findRollupHeader(
  lines: string[]
): { headerIdx: number; indexCol: number; tasksCol: number; doneCol: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trimStart().startsWith('|')) continue;
    const cells = contentCells(line).map((c) => c.toLowerCase());
    const indexCol = cells.indexOf('index');
    const tasksCol = cells.indexOf('tasks');
    const doneCol = cells.indexOf('done');
    if (indexCol !== -1 && tasksCol !== -1 && doneCol !== -1) {
      return { headerIdx: i, indexCol, tasksCol, doneCol };
    }
  }
  return null;
}

/** @purpose Extract the link target from a markdown-link cell (`[3-tasks](./x.3-tasks.md)` → `./x.3-tasks.md`), or null if the cell carries no link. */
function linkTarget(cell: string): string | null {
  return cell.match(/\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? null;
}

/**
 * @purpose Recompute a rollup table's Tasks/Done cells from each row's linked tracker file.
 * @invariant A non-rollup table, or a row with no link / an unresolvable target, stays byte-identical.
 * @param content Full markdown of the rollup file (e.g. `specs/3-tasks.md`, or a scope's `*.3-tasks.md`).
 * @param resolveRows For an Index-cell link target, that tracker's rows, or null if unreadable.
 * @returns The rewritten content, plus the link target of every row whose cells changed.
 */
export function recomputeRollupProgress(
  content: string,
  resolveRows: (indexLink: string) => TrackerRow[] | null
): { text: string; updated: string[] } {
  const lines = content.split('\n');
  const header = findRollupHeader(lines);
  if (!header) return { text: content, updated: [] };

  const updated: string[] = [];
  for (let i = header.headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trimStart().startsWith('|')) break;
    if (/^\|?\s*-+\s*\|/.test(line)) continue;
    const cells = contentCells(line);
    const link = linkTarget(cells[header.indexCol] ?? '');
    if (!link) continue;
    const rows = resolveRows(link);
    if (!rows) continue;

    const done = rows.filter((r) => isRowDone(r.status)).length;
    const total = rows.length;
    const raw = line.split('|');
    const tasksTarget = header.tasksCol + 1;
    const doneTarget = header.doneCol + 1;
    if (raw[tasksTarget] === undefined || raw[doneTarget] === undefined) continue;

    const newTasks = ` ${total} `;
    const newDone = ` ${done}/${total} `;
    if (raw[tasksTarget] === newTasks && raw[doneTarget] === newDone) continue;

    raw[tasksTarget] = newTasks;
    raw[doneTarget] = newDone;
    lines[i] = raw.join('|');
    updated.push(link);
  }

  return { text: lines.join('\n'), updated };
}
