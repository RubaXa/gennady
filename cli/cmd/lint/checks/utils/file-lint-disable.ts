// @file: File-level lint exemption syntax and scoped authorization against the owning module Decision Log.
// @spec: CLI-LINT
// @consumers: DisablesCheck, DbcContractCheck, InventorySyncCheck

import { canonicalDecisionRecord } from '../../../../../shared/sdd/deviation.ts';

/** @purpose Marker token of a file-level lint exemption. */
export const FILE_LINT_DISABLE_MARKER = 'gennady-lint-disable';

/** @purpose Match the active `<ACR>-DL-N` reference while retaining immutable legacy `D-N` citations. */
export const DECISION_LOG_REF_RE = /\b(?:[A-Z][A-Z0-9]*-DL-\d+|D-\d+)\b/i;

/** @purpose The only accepted directive shape: the marker opens the comment and is followed by `:`. */
const DIRECTIVE_RE = new RegExp(`^//\\s*${FILE_LINT_DISABLE_MARKER}\\s*:(.*)$`);

/** @purpose Minimum non-whitespace purpose characters after the marker and its Decision Log reference. */
export const MIN_DISABLE_PURPOSE_CHARS = 8;

/** @purpose A valid file-level exemption found in the leading comment block. */
export type FileLintDisable = {
  /** @purpose 1-based line of the marker. */
  readonly line: number;
  /** @purpose Decision Log reference to resolve before granting an exemption. */
  readonly ref: string;
};

/**
 * @purpose Find a syntactically valid `// gennady-lint-disable: <ACR>-DL-N <reason>` in the file's leading comments.
 * @invariant Only a canonical `// gennady-lint-disable:` line in the leading `//` block counts; prose that
 *   mentions the marker, a marker below code, or one without a reference or reason never exempts.
 * @param content Source text.
 * @returns The exemption, or null when the file must be checked in full.
 */
export function findFileLintDisable(content: string): FileLintDisable | null {
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('//')) return null;
    const directive = DIRECTIVE_RE.exec(trimmed);
    if (!directive) continue;
    const payload = directive[1] ?? '';
    const refMatch = DECISION_LOG_REF_RE.exec(payload);
    if (!refMatch) return null;
    const purpose = payload.replace(refMatch[0], '').replace(/\s/g, '');
    if (purpose.length < MIN_DISABLE_PURPOSE_CHARS) return null;
    return { line: index + 1, ref: refMatch[0] };
  }
  return null;
}

/**
 * @purpose Resolve an exemption against an accepted record in the owning module's canonical log.
 * @param content File containing the proposed marker.
 * @param file Exact repository-relative source path.
 * @param spec Owning module specification, never an arbitrary cited document.
 * @returns Scoped permissions or an explicit rejection; syntax alone grants nothing.
 */
export function authorizeFileLintDisable(
  content: string,
  file: string,
  spec: string
):
  | { ok: true; checks: ReadonlySet<'dbc' | 'inventory'>; ref: string }
  | { ok: false; detail: string } {
  const marker = findFileLintDisable(content);
  if (!marker) return { ok: false, detail: 'No canonical file exception marker' };
  const entry = canonicalDecisionRecord(spec, marker.ref, 'module');
  if (entry?.verdict !== 'accepted')
    return {
      ok: false,
      detail: `${marker.ref} must resolve uniquely to an accepted owning-module Decision Log entry`,
    };
  const match = / — lint-exemption: (.+) \[verdict: accepted\]\s*$/.exec(entry.text);
  if (!match)
    return {
      ok: false,
      detail: 'Expected lint-exemption JSON with file, checks and why in the canonical decision',
    };
  let payload: unknown;
  try {
    payload = JSON.parse(match[1]!);
  } catch {
    return { ok: false, detail: 'Invalid lint-exemption JSON' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return { ok: false, detail: 'Expected lint-exemption object' };
  const value = payload as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !== 'checks,file,why' ||
    value.file !== file ||
    typeof value.why !== 'string' ||
    value.why.replace(/\s/g, '').length < 8 ||
    !Array.isArray(value.checks) ||
    value.checks.length === 0 ||
    value.checks.some((check) => check !== 'dbc' && check !== 'inventory') ||
    new Set(value.checks).size !== value.checks.length
  )
    return {
      ok: false,
      detail:
        'Exception must name this exact file, a nonempty closed check set (dbc/inventory), and a meaningful why',
    };
  return { ok: true, checks: new Set(value.checks as ('dbc' | 'inventory')[]), ref: marker.ref };
}
