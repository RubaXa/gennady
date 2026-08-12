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
  'portal',
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
      '  expected: gennady sdd-new <kind> --scope <s> [--module <m[/sub/sub]>] [--id <ACR-slug>] [--out <path>]',
      '  or:       gennady sdd-new --list',
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
      '  Run `gennady sdd-new --list` to see every kind with its path pattern.',
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
 * @purpose Render the success report: created path + section manifest table.
 * @param kind Artifact kind created.
 * @param path Path the skeleton was written to.
 * @param sections Section manifest for this kind.
 * @returns Report text for stdout.
 */
export function renderCreated(
  kind: ArtifactKind,
  path: string,
  sections: SectionManifestEntry[]
): string {
  return [`[sdd-new] created ${kind} skeleton: ${path}`, '', renderManifestTable(sections)].join(
    '\n'
  );
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
