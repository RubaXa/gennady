// @file: InventorySyncCheck — reconcile code exports with the module Entity Inventory both ways: undeclared exports (forward) and declared-but-unimplemented entities (reverse sweep).
// @spec: CLI-LINT
// @consumers: LintCommand

import { relative, resolve, sep } from 'node:path';
import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import { extractSection } from '../../../../shared/sdd/section.ts';
import {
  ERR_CLI_LINT_INVENTORY_UNDECLARED,
  ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
  ERR_CLI_LINT_INVENTORY_STALE_DEFERRAL,
  type LintError,
} from '../lint.types.ts';
import { findFileLintDisable } from './utils/file-lint-disable.ts';

// A table (`| \`Name\` | Type | ... Deferred Implementation: TSK-1 |`) or bullet row
// (`- \`Name\` — ... Deferred Implementation: TSK-1`) whose text carries this marker —
// same style as `Deferred Test Ownership:` in shared/sdd/bdd-coverage.ts.
const DEFERRED_ENTITY_RE = /^[|-]\s*`([^`]+)`.*?Deferred Implementation:\s*([A-Za-z0-9][\w-]*)/;

// Same row styles, marking the entity as a file's default export: `Default Export: app/service/storage.ts`.
const DEFAULT_EXPORT_ENTITY_RE = /^[|-]\s*`([^`]+)`.*?Default Export:\s*`?([^\s`|]+)`?/;

/** @purpose `collectExports` token: the file at this repo path has a default export. */
const DEFAULT_MARK = 'default@';

/** @purpose `collectExports` token: this file's exports cannot be listed (parse failure or `export *`). */
const UNVERIFIABLE_MARK = 'unverifiable@';

/**
 * @purpose Repo-relative, forward-slash form of a scanned path, shared by export tokens and spec markers.
 * @param filePath Absolute or cwd-relative path.
 * @returns Normalized path.
 */
function exportMarkerPath(filePath: string): string {
  return relative(process.cwd(), resolve(filePath)).split(sep).join('/');
}

/**
 * @purpose Flag exported entities introduced in code but not declared in the module's closed-world Entity Inventory.
 * @invariant TS-only via the AST adapter; a parse failure yields [] (DbcContractCheck owns parse errors). Pure w.r.t. `declared`.
 * @param content Source text.
 * @param filePath File path — AST input and error location.
 * @param declared Entity names declared in the module spec inventory.
 * @param [fileDisableAuthorized] Caller-resolved canonical permission for this file.
 * @returns One error per exported entity not in `declared`; empty when every export is declared.
 */
export async function check(
  content: string,
  filePath: string,
  declared: string[],
  fileDisableAuthorized = false
): Promise<LintError[]> {
  if (fileDisableAuthorized && findFileLintDisable(content) !== null) return [];
  const result = await new DbcTsAstAdapter().parseExportNames(filePath, content);
  if (!result.ok) return [];
  const declaredSet = new Set(declared);
  // Re-exports are declared by the module that defines them; only this file's own exports count.
  return result.names.local
    .filter((name) => !declaredSet.has(name))
    .map((name) => ({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNDECLARED,
      message: `Exported \`${name}\` is not in the module's closed-world Entity Inventory (AX_CLOSED_WORLD_INVENTORY). Fix: remove it, or — if genuinely needed — log an \`intro <name> ← <reason>\` line (AX_INTRODUCED_DISCIPLINE) and backflow it into the spec inventory; never silently keep an undeclared export. If you added it under drift / context loss, re-read the module spec ## 3 Entity Inventory and AX_INTRODUCED_DISCIPLINE.`,
    }));
}

/**
 * @purpose Export names of one source file — its contribution to the module's implemented set (reverse sweep).
 * @invariant Every ES export form counts, re-exports included; `default@<path>` marks a default export and
 *   `unverifiable@<path>` a file whose names cannot be listed (`export *`, parse failure). Pure.
 * @param content Source text.
 * @param filePath File path — AST input and marker path.
 * @returns Export names plus marker tokens.
 */
export async function collectExports(content: string, filePath: string): Promise<string[]> {
  // An exempt file skips only the forward undeclared check; its exports still implement declared
  // entities, so the reverse sweep keeps seeing them.
  const file = exportMarkerPath(filePath);
  const result = await new DbcTsAstAdapter().parseExportNames(filePath, content);
  if (!result.ok) return [`${UNVERIFIABLE_MARK}${file}`];
  const { local, reexported, hasDefault, starReexport } = result.names;
  return [
    ...local,
    ...reexported,
    ...(hasDefault ? [`${DEFAULT_MARK}${file}`] : []),
    ...(starReexport ? [`${UNVERIFIABLE_MARK}${file}`] : []),
  ];
}

/**
 * @purpose Entity → deferring Task-ID parsed from a module spec's Entity Inventory body.
 * @invariant Mirrors `Deferred Test Ownership:` parsing in bdd-coverage.ts; a row lacking the marker is absent from the result — never guessed.
 * @param specContent Full module-spec markdown.
 * @returns Declared entity name → the Task-ID its implementation is deferred to; empty when the spec has no such marker.
 */
export function parseDeferredEntities(specContent: string): Map<string, string> {
  const out = new Map<string, string>();
  const sec = extractSection(specContent, 'ENTITY_INVENTORY');
  if (sec.status !== 'ok') return out;
  for (const rawLine of sec.content.split('\n')) {
    const m = DEFERRED_ENTITY_RE.exec(rawLine.trim());
    if (m?.[1] && m[2]) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * @purpose Entity → file whose default export implements it, from `Default Export: <path>` inventory rows.
 * @invariant A row without the marker is absent; the name a default export carries in code is never guessed.
 * @param specContent Full module-spec markdown.
 * @returns Declared entity name → repo-relative path of the file that default-exports it.
 */
export function parseDefaultExportEntities(specContent: string): Map<string, string> {
  const out = new Map<string, string>();
  const sec = extractSection(specContent, 'ENTITY_INVENTORY');
  if (sec.status !== 'ok') return out;
  for (const rawLine of sec.content.split('\n')) {
    const m = DEFAULT_EXPORT_ENTITY_RE.exec(rawLine.trim());
    if (m?.[1] && m[2]) out.set(m[1], m[2].replace(/^\.\//, ''));
  }
  return out;
}

/** @purpose One declared entity whose implementation the spec defers to a later ticket — informational, never drift. */
export type DeferredInventoryEntity = {
  /** @purpose Declared entity name. */
  name: string;
  /** @purpose Task-ID the spec defers this entity's implementation to. */
  taskId: string;
};

/** @purpose A `Deferred Implementation: <taskId>` marker resolved against the ticket graph — valid only when the ticket really owns the deferral. */
export type DeferralCheck = {
  /** @purpose The cited Task-ID. */
  taskId: string;
  /** @purpose True only when a real, ACTIVE (TODO/IN_PROGRESS), same-scope ticket owns the deferral. */
  valid: boolean;
  /** @purpose Why the deferral is invalid (only when `valid` is false). */
  reason?: string;
};

/** @purpose ACTIVE Meta-Status tokens — the only statuses whose ticket is actively going to build the entity. */
const ACTIVE_STATUS = /\b(?:TODO|IN[\s_-]?PROGRESS)\b/i;

// A deferral is a promise that a LATER ticket will actively build the entity, so the owner must be
// able to keep it: it must exist, be ACTIVE (only TODO / IN_PROGRESS — DONE is already past,
// CANCELLED never will, BLOCKED is stalled with no promised date; a missing status can't be
// confirmed active), belong to the spec's scope when that scope is known (a missing or foreign
// scope is drift), and — crucially — actually OWN the entity: its own text must NAME it, else any
// active same-scope ticket could be cited for any entity.
/**
 * @purpose Resolve a `Deferred Implementation` marker — valid only for a real, ACTIVE, same-scope
 *   ticket that OWNS the entity (rule in the note above).
 * @invariant Pure — `tickets` gives Task-ID/status/scope; STRUCTURAL ownership is decided by the
 *   caller (via `ticketOwnsEntity`) and passed as the `ticketOwns` boolean, never computed here.
 * @param taskId The cited Task-ID.
 * @param tickets The project's ticket refs (Task-ID, status, and owning scope).
 * @param specScope The spec's own scope (derived from its path); '' when the path carries none.
 * @param entityName The declared entity this marker defers — named in the reason for context.
 * @param ticketOwns Whether the ticket STRUCTURALLY owns the entity (Target Files / Implements field),
 *   fail-closed to false when the ticket is unreadable.
 * @returns The check verdict; `valid: false` carries a `reason`.
 */
export function checkDeferral(
  taskId: string,
  tickets: ReadonlyArray<{
    taskId?: string | null;
    status?: string | null;
    scope?: string | null;
  }>,
  specScope: string,
  entityName: string,
  ticketOwns: boolean
): DeferralCheck {
  const ref = tickets.find((t) => t.taskId === taskId);
  if (!ref) {
    return { taskId, valid: false, reason: `тикет ${taskId} не найден в дереве` };
  }
  const status = (ref.status ?? '').trim();
  if (status === '') {
    return {
      taskId,
      valid: false,
      reason: `у тикета ${taskId} не распознан статус — нельзя подтвердить, что он активен и построит сущность`,
    };
  }
  if (!ACTIVE_STATUS.test(status)) {
    return {
      taskId,
      valid: false,
      reason: `тикет ${taskId} не в активном статусе (${status}) — только TODO/IN_PROGRESS активно строит отложенную сущность (DONE/CANCELLED/BLOCKED — нет)`,
    };
  }
  if (specScope) {
    if (!ref.scope) {
      return {
        taskId,
        valid: false,
        reason: `у тикета ${taskId} не указан скоуп — нельзя подтвердить принадлежность скоупу спеки '${specScope}'`,
      };
    }
    if (ref.scope !== specScope) {
      return {
        taskId,
        valid: false,
        reason: `тикет ${taskId} принадлежит скоупу '${ref.scope}', а не скоупу спеки '${specScope}'`,
      };
    }
  }
  // Ownership: the ticket must STRUCTURALLY own the entity (its parsed Target Files name it, or an
  // Implements/Provides/Entity field declares it — decided by `ticketOwnsEntity`), else it is only an
  // active same-scope ticket, not the proven owner. Unreadable ticket → caller passes false (fail-closed).
  if (!ticketOwns) {
    return {
      taskId,
      valid: false,
      reason: `тикет ${taskId} структурно не владеет сущностью '${entityName}' (нет в его Target Files и нет поля Implements/Provides/Entity) — активный same-scope тикет есть, но владение не подтверждено`,
    };
  }
  return { taskId, valid: true };
}

/** @purpose Reverse-sweep outcome: unimplemented-entity errors, plus entities the spec explicitly defers to a later ticket. */
export type ReverseSweepResult = {
  /** @purpose One ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED per non-deferred, unimplemented entity. */
  errors: LintError[];
  /** @purpose Declared entities marked `Deferred Implementation:` — informational, excluded from `errors`. */
  deferred: DeferredInventoryEntity[];
  /** @purpose Missing entities that a not-listable file (parse failure, `export *`) may provide — informational. */
  unverifiable: { name: string; files: string[] }[];
};

/**
 * @purpose Flag inventory entities declared in the spec but exported by no scanned file — planned-but-unbuilt / renamed-away — unless deferred to a later ticket.
 * @invariant SOUND only when `implemented` is the union over the WHOLE module — the opt-in `--inventory-reverse` flag is the guard against partial sweeps. Pure.
 * @invariant Valid-deferred + unimplemented → `deferred`. Implemented + still-marked → STALE error. Invalid deferral on a missing entity → drift error.
 * @param declared Entity names from the module spec inventory.
 * @param implemented Union of exported names across every scanned file.
 * @param specPath Module spec path — error location for the operator.
 * @param [deferredEntities] Entity name → resolved `DeferralCheck` (from `checkDeferral`); defaults to none deferred. An INVALID deferral is drift, not an exemption.
 * @param [defaultExports] Entity name → repo-relative file whose anonymous default implements it (`Default Export:` marker).
 * @returns Errors for non-deferred unimplemented entities AND for invalid deferrals, plus the validly-deferred entities; all empty when everything is implemented.
 */
export function reverseUnimplemented(
  declared: string[],
  implemented: Set<string>,
  specPath: string,
  deferredEntities: Map<string, DeferralCheck> = new Map(),
  defaultExports: Map<string, string> = new Map()
): ReverseSweepResult {
  const errors: LintError[] = [];
  const deferred: DeferredInventoryEntity[] = [];
  const unverifiable: { name: string; files: string[] }[] = [];
  const opaqueFiles = [...implemented]
    .filter((token) => token.startsWith(UNVERIFIABLE_MARK))
    .map((token) => token.slice(UNVERIFIABLE_MARK.length));

  for (const name of declared) {
    const deferral = deferredEntities.get(name);
    const defaultFile = defaultExports.get(name);
    const isImplemented =
      implemented.has(name) ||
      (defaultFile !== undefined && implemented.has(`${DEFAULT_MARK}${defaultFile}`));

    if (isImplemented) {
      // An entity that is ALREADY built but still carries a `Deferred Implementation` marker — the
      // marker is stale (there is nothing left to defer). Flag it so the spec gets cleaned, rather
      // than leaving a dead deferral that a future reader trusts.
      if (deferral) {
        errors.push({
          file: specPath,
          line: 1,
          col: 1,
          severity: 'error' as const,
          code: ERR_CLI_LINT_INVENTORY_STALE_DEFERRAL,
          message: `Inventory entity \`${name}\` is implemented, yet still marked \`Deferred Implementation: ${deferral.taskId}\`. A built entity is not deferred — remove the stale marker from the inventory row.`,
        });
      }
      continue;
    }

    if (deferral) {
      if (deferral.valid) {
        deferred.push({ name, taskId: deferral.taskId });
        continue;
      }
      errors.push({
        file: specPath,
        line: 1,
        col: 1,
        severity: 'error' as const,
        code: ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
        message: `Inventory entity \`${name}\` is marked \`Deferred Implementation: ${deferral.taskId}\`, but that deferral is not valid: ${deferral.reason}. A deferral only excuses a missing entity when a real, open, same-scope ticket owns it — otherwise the entity is undelivered drift. Fix: point the marker at a valid open ticket in this scope, implement the entity, or remove the inventory row.`,
      });
      continue;
    }

    if (opaqueFiles.length > 0) {
      unverifiable.push({ name, files: opaqueFiles });
      continue;
    }

    errors.push({
      file: specPath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
      message: `Inventory entity \`${name}\` is declared in the spec but exported by no scanned file${defaultFile ? ` (marked \`Default Export: ${defaultFile}\`, but that file has no default export in the sweep)` : ''} — planned-but-unbuilt or renamed-away. Before removing the row, check that the file which exports it is in the module File Mapping and was passed to this sweep. A default export without a name in code is matched only through \`Default Export: <path>\` in the inventory row. Fix: implement it, add the missing file to File Mapping, add \`Default Export: <path>\`, mark it \`Deferred Implementation: <TSK-id>\` when a later ticket owns it, or — only when it is really gone — remove the stale row and supersede the decision that introduced it.`,
    });
  }

  return { errors, deferred, unverifiable };
}
