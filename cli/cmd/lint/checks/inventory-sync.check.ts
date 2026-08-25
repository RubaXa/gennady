// @file: InventorySyncCheck — reconcile code exports with the module Entity Inventory both ways: undeclared exports (forward) and declared-but-unimplemented entities (reverse sweep).
// @consumers: LintCommand

import { DbcTsAstAdapter } from '../../../../services/dbc/linter/implementations/ts/dbc-ts-ast-adapter.ts';
import { extractSection } from '../../../../shared/sdd/section.ts';
import {
  ERR_CLI_LINT_INVENTORY_UNDECLARED,
  ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
  type LintError,
} from '../lint.types.ts';

// A table (`| \`Name\` | Type | ... Deferred Implementation: TSK-1 |`) or bullet row
// (`- \`Name\` — ... Deferred Implementation: TSK-1`) whose text carries this marker —
// same style as `Deferred Test Ownership:` in shared/sdd/bdd-coverage.ts.
const DEFERRED_ENTITY_RE = /^[|-]\s*`([^`]+)`.*?Deferred Implementation:\s*([A-Za-z0-9][\w-]*)/;

/**
 * @purpose Flag exported entities introduced in code but not declared in the module's closed-world Entity Inventory.
 * @invariant TS-only via the AST adapter; a parse failure yields [] (DbcContractCheck owns parse errors). Pure w.r.t. `declared`.
 * @param content Source text.
 * @param filePath File path — AST input and error location.
 * @param declared Entity names declared in the module spec inventory.
 * @returns One error per exported entity not in `declared`; empty when every export is declared.
 */
export async function check(
  content: string,
  filePath: string,
  declared: string[]
): Promise<LintError[]> {
  const result = await new DbcTsAstAdapter().parseFile(filePath, content);
  if (!result.ok) return [];
  const declaredSet = new Set(declared);
  return result.exported
    .filter((e) => !declaredSet.has(e.name))
    .map((e) => ({
      file: filePath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNDECLARED,
      message: `Exported \`${e.name}\` is not in the module's closed-world Entity Inventory (AX_CLOSED_WORLD_INVENTORY). Fix: remove it, or — if genuinely needed — log an \`intro <name> ← <reason>\` line (AX_INTRODUCED_DISCIPLINE) and backflow it into the spec inventory; never silently keep an undeclared export. If you added it under drift / context loss, re-read the module spec ## 3 Entity Inventory and AX_INTRODUCED_DISCIPLINE.`,
    }));
}

/**
 * @purpose Exported entity names of one TS file — the per-file contribution to the module's implemented set (reverse-direction sweep).
 * @invariant TS-only via the AST adapter; a parse failure yields [] (DbcContractCheck owns parse errors). Pure.
 * @param content Source text.
 * @param filePath File path — AST input.
 * @returns Exported entity names; empty when the file does not parse.
 */
export async function collectExports(content: string, filePath: string): Promise<string[]> {
  const result = await new DbcTsAstAdapter().parseFile(filePath, content);
  return result.ok ? result.exported.map((e) => e.name) : [];
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

/** @purpose One declared entity whose implementation the spec defers to a later ticket — informational, never drift. */
export type DeferredInventoryEntity = {
  /** @purpose Declared entity name. */
  name: string;
  /** @purpose Task-ID the spec defers this entity's implementation to. */
  taskId: string;
};

/** @purpose Reverse-sweep outcome: unimplemented-entity errors, plus entities the spec explicitly defers to a later ticket. */
export type ReverseSweepResult = {
  /** @purpose One ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED per non-deferred, unimplemented entity. */
  errors: LintError[];
  /** @purpose Declared entities marked `Deferred Implementation:` — informational, excluded from `errors`. */
  deferred: DeferredInventoryEntity[];
};

/**
 * @purpose Flag inventory entities declared in the spec but exported by no scanned file — planned-but-unbuilt / renamed-away — unless deferred to a later ticket.
 * @invariant SOUND only when `implemented` is the union over the WHOLE module — the opt-in `--inventory-reverse` flag is the guard against partial sweeps. Pure.
 * @invariant An entity present in `deferredEntities` never yields an error — it is reported via `deferred` instead, regardless of `implemented`.
 * @param declared Entity names from the module spec inventory.
 * @param implemented Union of exported names across every scanned file.
 * @param specPath Module spec path — error location for the operator.
 * @param [deferredEntities] Entity name → deferring Task-ID, from `parseDeferredEntities`; defaults to none deferred.
 * @returns Errors for non-deferred unimplemented entities, plus the deferred entities found; both empty when all are implemented.
 */
export function reverseUnimplemented(
  declared: string[],
  implemented: Set<string>,
  specPath: string,
  deferredEntities: Map<string, string> = new Map()
): ReverseSweepResult {
  const errors: LintError[] = [];
  const deferred: DeferredInventoryEntity[] = [];

  for (const name of declared) {
    if (implemented.has(name)) continue;

    const taskId = deferredEntities.get(name);
    if (taskId) {
      deferred.push({ name, taskId });
      continue;
    }

    errors.push({
      file: specPath,
      line: 1,
      col: 1,
      severity: 'error' as const,
      code: ERR_CLI_LINT_INVENTORY_UNIMPLEMENTED,
      message: `Inventory entity \`${name}\` is declared in the spec but exported by no scanned file — planned-but-unbuilt or renamed-away. Fix: implement it, or remove the stale inventory row (and supersede the decision that introduced it), or mark it \`Deferred Implementation: <TSK-id>\` when a later ticket owns it. If the sweep did not cover the whole module, re-run \`lint --spec=<spec> --inventory-reverse <module-dir>\` over the full code root before trusting this.`,
    });
  }

  return { errors, deferred };
}
