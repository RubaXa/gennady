// @file: Types, error codes, and diagnostic builders for the sdd-new command.
// @consumers: SddNewCommand
// @tasks: N/A

import type { ArtifactKind, SectionManifestEntry } from '../../../shared/sdd/templates.ts';

/** @purpose No <kind> positional argument, or a required option is missing for the given kind. */
export const ERR_CLI_SDD_NEW_BAD_INVOCATION = 'ERR_CLI_SDD_NEW_BAD_INVOCATION' as const;
/** @purpose <kind> does not match any entry in the template registry. */
export const ERR_CLI_SDD_NEW_UNKNOWN_KIND = 'ERR_CLI_SDD_NEW_UNKNOWN_KIND' as const;
/** @purpose The computed (or --out) target path already exists — sdd-new never overwrites. */
export const ERR_CLI_SDD_NEW_FILE_EXISTS = 'ERR_CLI_SDD_NEW_FILE_EXISTS' as const;
/** @purpose Writing the skeleton (or creating parent directories) failed. */
export const ERR_CLI_SDD_NEW_WRITE_FAILED = 'ERR_CLI_SDD_NEW_WRITE_FAILED' as const;
/** @purpose --id fails the v2 grammar/length cap, or collides (duplicate or prefix) with an existing Task-ID. */
export const ERR_CLI_SDD_NEW_BAD_TASK_ID = 'ERR_CLI_SDD_NEW_BAD_TASK_ID' as const;
/** @purpose A task was requested before its scope/decomposition could be proved. */
export const ERR_CLI_SDD_NEW_SCOPE_NOT_DECOMPOSED = 'ERR_CLI_SDD_NEW_SCOPE_NOT_DECOMPOSED' as const;

/**
 * @purpose Result of one sdd-new run.
 * @invariant On success `text` is the created-path + section manifest report; on failure `message` is never empty.
 */
export type NewOutcome =
  | { ok: true; text: string; path: string }
  | { ok: false; code: string; exitCode: 1 | 2 | 4; message: string };

const KNOWN_KINDS = [
  'product',
  'library',
  'infrastructure',
  'interface',
  'module',
  'task',
  'module-index',
  'scope-index',
  'project-index',
  'portal',
  'research',
];

/**
 * @purpose Build the bad-invocation diagnostic.
 * @param detail What was wrong (missing kind, missing --scope, etc).
 * @returns Outcome with exit 4.
 */
export function badInvocation(detail: string): NewOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_BAD_INVOCATION,
    exitCode: 4,
    message: [
      `[sdd-new] ${ERR_CLI_SDD_NEW_BAD_INVOCATION}: ${detail}`,
      '  expected: npx gennady sdd-new <kind> --scope <s> [--module <m[/sub/sub]>] [--id <ACR-slug>] [--slug <slug>] [--out <path>]',
      '  task:     npx gennady sdd-new task --scope <s> --id <ACR-slug> [--module <m>] [--out <path>]',
      '  inferred: npx gennady sdd-new task --id <ACR-slug> --out specs/<scope>/<path>',
      '  scope:    <s> is one kebab-case name (lowercase letters/digits and hyphens), never a path',
      '  or:       npx gennady sdd-new --list',
      `  <kind> ∈ ${KNOWN_KINDS.join(' | ')}`,
    ].join('\n'),
  };
}

/**
 * @purpose Build the unknown-kind diagnostic.
 * @param kind The rejected kind.
 * @returns Outcome with exit 4.
 */
export function unknownKind(kind: string): NewOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_UNKNOWN_KIND,
    exitCode: 4,
    message: [
      `[sdd-new] ${ERR_CLI_SDD_NEW_UNKNOWN_KIND}: "${kind}"`,
      `  Known kinds: ${KNOWN_KINDS.join(', ')}.`,
      '  Run `npx gennady sdd-new --list` to see every kind with its path pattern.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the bad-Task-ID diagnostic — grammar/length failure, or a duplicate/prefix collision. Never auto-substitutes; names the broken rule plus a concrete fix.
 * @param id The rejected --id.
 * @param reason What was wrong (from validateTaskId or describeIdConflict).
 * @param suggestion A conflict-free Task-ID (from suggestTaskId), or null when none was found.
 * @returns Outcome with exit 4.
 */
export function badTaskId(id: string, reason: string, suggestion: string | null): NewOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_BAD_TASK_ID,
    exitCode: 4,
    message: [
      `[sdd-new] ${ERR_CLI_SDD_NEW_BAD_TASK_ID}: "${id}"`,
      `  ${reason}`,
      suggestion
        ? `  try: --id ${suggestion}`
        : '  no automatic suggestion available — pick a different slug yourself.',
      '  sdd-new never auto-substitutes a Task-ID — fix --id and re-run.',
    ].join('\n'),
  };
}

/**
 * @purpose Explain the fail-closed scope/decomposition gate at the exact command that would violate it.
 * @param scope Scope whose task was requested.
 * @param reason Missing, unreadable, ambiguous, unsupported, or undecomposed scope evidence.
 * @returns Outcome with exit 1; a canonically classified infrastructure scope never calls this builder.
 */
export function scopeNotDecomposed(scope: string, reason: string): NewOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_SCOPE_NOT_DECOMPOSED,
    exitCode: 1,
    message: [
      `[sdd-new] ${ERR_CLI_SDD_NEW_SCOPE_NOT_DECOMPOSED}: cannot prove ${scope} is ready for task scaffolding.`,
      `  ${reason}.`,
      `  Continue through /sdd for ${scope} with module-decomposition intent; complete the real module flow before scaffolding any task.`,
      `  After integrated product/library review, rerun npx gennady sdd-new task --scope ${scope} --id <ACR-slug>; interface work uses its owning product/library scope.`,
      '  A canonically classified infrastructure scope is the sole flat-scope exception.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the file-exists diagnostic — sdd-new never overwrites an existing artifact.
 * @param path The path that already exists.
 * @returns Outcome with exit 1.
 */
export function fileExists(path: string): NewOutcome {
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_FILE_EXISTS,
    exitCode: 1,
    message: [
      `[sdd-new] ${ERR_CLI_SDD_NEW_FILE_EXISTS}: ${path}`,
      '  sdd-new never overwrites an existing artifact. Edit it directly, or pass --out with a fresh path.',
    ].join('\n'),
  };
}

/**
 * @purpose Build the write-failed diagnostic.
 * @param path The target path.
 * @param cause The underlying error.
 * @returns Outcome with exit 1.
 */
export function writeFailed(path: string, cause: unknown): NewOutcome {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return {
    ok: false,
    code: ERR_CLI_SDD_NEW_WRITE_FAILED,
    exitCode: 1,
    message: [`[sdd-new] ${ERR_CLI_SDD_NEW_WRITE_FAILED}: ${path}`, `  ${detail}`].join('\n'),
  };
}

/**
 * @purpose Render the section manifest as a plain-text table — the contract of "what to fill" an agent
 * reads after sdd-new creates the file.
 * @param sections Section manifest entries, in document order.
 * @returns A `Name | REQUIRED/OPTIONAL | FOLD | Fill` table, one row per section.
 */
export function renderManifestTable(sections: SectionManifestEntry[]): string {
  const rows = sections.map((s) => [
    s.name,
    s.required ? 'REQUIRED' : 'OPTIONAL',
    s.fold ? 'FOLD' : '-',
    s.fill,
  ]);
  const header = ['Section', 'Required', 'Fold', 'Fill'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] as string).length))
  );
  const line = (cols: string[]): string =>
    cols.map((c, i) => c.padEnd(widths[i] as number)).join('  ');
  return [
    line(header),
    line(widths.map((w) => '-'.repeat(w))),
    ...rows.map((r) => line(r as string[])),
  ].join('\n');
}

/**
 * @purpose Render the `next:` block — short, imperative lines telling the agent what to do after
 * the skeleton + manifest, per `ArtifactTemplate.nextSteps`.
 * @param nextSteps Resolved next-step lines (see `resolveNextSteps` in templates.ts).
 * @returns Report text block, empty string when there are no steps.
 */
export function renderNextSteps(nextSteps: string[]): string {
  if (nextSteps.length === 0) return '';
  return ['next:', ...nextSteps.map((s) => `  ${s}`)].join('\n');
}

/**
 * @purpose Render the success report: created path + section manifest table + next-steps block.
 * @param kind Artifact kind created.
 * @param path Path the skeleton was written to.
 * @param sections Section manifest for this kind.
 * @param nextSteps Resolved next-step lines for this kind (see `resolveNextSteps`).
 * @returns Report text for stdout.
 */
export function renderCreated(
  kind: ArtifactKind,
  path: string,
  sections: SectionManifestEntry[],
  nextSteps: string[]
): string {
  return [
    `[sdd-new] created ${kind} skeleton: ${path}`,
    '',
    renderManifestTable(sections),
    '',
    renderNextSteps(nextSteps),
  ].join('\n');
}

/**
 * @purpose Render the `--manifest` report: section manifest table for a kind — no file created,
 * no path resolved, `--scope`/`--module` not required.
 * @param kind Artifact kind queried.
 * @param sections Section manifest for this kind.
 * @returns Report text for stdout.
 */
export function renderManifestReport(kind: ArtifactKind, sections: SectionManifestEntry[]): string {
  return [`[sdd-new] manifest for ${kind}:`, '', renderManifestTable(sections)].join('\n');
}
