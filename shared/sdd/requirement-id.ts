// @file: <ACR>-REQ-<N> / <ACR>-DL-<N> grammar + the spec's own acronym derivation (AX_REQ_DL_ID_GRAMMAR) — shared by sdd-check's requirement/decision-log ID checks in check.ts.
// @consumers: check.ts
// @tasks: N/A

// Requirement-ID grammar per REQUIREMENT_ENTRY_FORMAT: `<ACR>-REQ-<N>` — ACR is upper-alnum
// starting with a letter (same shape as a Task-ID's ACR half, see task-id.ts); `<N>` is a
// sequential integer, unique WITHIN one spec only (the ACR gives global uniqueness, not the number).
/** @purpose `<ACR>-REQ-<N>` grammar per REQUIREMENT_ENTRY_FORMAT. */
export const REQ_ID_GRAMMAR = /^([A-Z][A-Z0-9]*)-REQ-([0-9]+)$/;

/** @purpose `<ACR>-DL-<N>` grammar per DECISION_LOG_ENTRY_FORMAT — same ACR/N shape as REQ_ID_GRAMMAR. */
export const DL_ID_GRAMMAR = /^([A-Z][A-Z0-9]*)-DL-([0-9]+)$/;

// Pre-migration Decision Log ID: file-local `D-<NNN>` (unique only inside one file). Valid and NOT
// an error — DECISION_LOG_ENTRY_FORMAT replaces it going forward, but dozens of existing specs
// still carry it; routed only to the warn-level migration hint, never to grammar-style rejection.
/** @purpose Pre-migration, file-local Decision Log ID: `D-<NNN>`. Valid, never an error. */
export const LEGACY_DL_ID_GRAMMAR = /^D-([0-9]+)$/;

// NEW invariant, introduced here — no prior source exists anywhere in the project for a spec's
// "own acronym": no Meta field records it, and unlike Task-ID (free-form per ticket, no
// scope/module mapping at all — see task-id.ts) there is nothing else to derive it from but the
// spec's own file name.
/**
 * @purpose Derive a spec's own acronym for REQ/DL-ID matching, from its file name alone.
 * @invariant Reads ONLY the `<name>` in `<name>.spec.md` / `<name>.1-spec.md`, split on `-`.
 * @invariant ≥2 words → initials uppercased (`inbox-core` → `IC`); 1 word → its first 3 chars uppercased (`vcs` → `VCS`).
 * @invariant Accepted gap: sibling specs can collide (`inbox-core`/`inbox-chat` both → `IC`) — defends per-spec hygiene only, not cross-spec uniqueness.
 * @param specFile A `.spec.md` / `.1-spec.md` file path (any separator style).
 * @returns The derived acronym — uppercase letters only, at least 1 character.
 */
export function deriveSpecAcronym(specFile: string): string {
  // Separator-agnostic basename (mirrors checkScopeDeps's own `/([^/\\]+)\.(?:spec|1-spec)\.md$/`
  // stem extraction in check.ts) — node:path's basename only splits on the platform separator.
  const base = /([^/\\]+)\.(?:1-spec|spec)\.md$/.exec(specFile)?.[1] ?? specFile;
  const words = base.split('-').filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => (w[0] ?? '').toUpperCase()).join('');
  }
  const only = words[0] ?? base;
  return only.slice(0, 3).toUpperCase();
}

/** @purpose Kind discriminator shared by the REQ and DL ID checks — same shape, different literal token. */
export type SpecEntryIdKind = 'REQ' | 'DL';

/** @purpose Resolve the grammar RegExp for one entry-ID kind. | @param kind 'REQ' or 'DL'. | @returns The matching grammar constant. */
function grammarFor(kind: SpecEntryIdKind): RegExp {
  return kind === 'REQ' ? REQ_ID_GRAMMAR : DL_ID_GRAMMAR;
}

/** @purpose Human label for one entry-ID kind, for message text. | @param kind 'REQ' or 'DL'. | @returns 'Requirement' or 'Decision-Log'. */
function labelFor(kind: SpecEntryIdKind): string {
  return kind === 'REQ' ? 'Requirement' : 'Decision-Log';
}

/**
 * @purpose Validate one entry-ID's grammar only (no acronym check) — SDD_REQ_ID_GRAMMAR /
 * SDD_DL_ID_GRAMMAR's pure core.
 * @param id Candidate ID token (e.g. `GAT-REQ-3`, `GAT-DL-1`).
 * @param kind 'REQ' or 'DL'.
 * @param exampleAcr Acronym to show in the corrected example (the spec's own derived acronym, or a placeholder).
 * @returns null when the grammar matches, else a human-readable reason + example fix.
 */
export function validateSpecEntryId(
  id: string,
  kind: SpecEntryIdKind,
  exampleAcr: string
): string | null {
  if (grammarFor(kind).test(id)) return null;
  return `${labelFor(kind)}-ID "${id}" не соответствует грамматике \`<ACR>-${kind}-<N>\`: ^[A-Z][A-Z0-9]*-${kind}-[0-9]+$ (например: \`${exampleAcr}-${kind}-1\`).`;
}

/**
 * @purpose Extract the ACR half of an already-grammar-valid entry-ID.
 * @param id A grammar-valid entry-ID.
 * @param kind 'REQ' or 'DL'.
 * @returns The ACR token, or null if `id` does not match the grammar.
 */
export function specEntryAcronym(id: string, kind: SpecEntryIdKind): string | null {
  return grammarFor(kind).exec(id)?.[1] ?? null;
}

/**
 * @purpose Extract the numeric half of an already-grammar-valid entry-ID.
 * @param id A grammar-valid entry-ID.
 * @param kind 'REQ' or 'DL'.
 * @returns The number token (raw string, leading zeros preserved), or null if `id` does not match the grammar.
 */
export function specEntryNumber(id: string, kind: SpecEntryIdKind): string | null {
  return grammarFor(kind).exec(id)?.[2] ?? null;
}

/**
 * @purpose Render an acronym-mismatch finding message — the entry's ACR differs from the spec's
 * own derived acronym.
 * @param id The grammar-valid entry-ID as written.
 * @param kind 'REQ' or 'DL'.
 * @param actualAcr The ACR the entry actually uses.
 * @param expectedAcr The spec's own derived acronym (deriveSpecAcronym).
 * @param n The entry's number half (for the corrected example).
 * @returns A human-readable, tool-teaches message.
 */
export function describeAcronymMismatch(
  id: string,
  kind: SpecEntryIdKind,
  actualAcr: string,
  expectedAcr: string,
  n: string
): string {
  return `${labelFor(kind)}-ID "${id}" использует акроним "${actualAcr}", а акроним этой спеки — "${expectedAcr}" (выведен из имени файла спеки, contract AX_REQ_DL_ID_GRAMMAR) — используй \`${expectedAcr}-${kind}-${n}\`.`;
}

/**
 * @purpose Render a duplicate-number finding message — the same number used by ≥2 entries in one spec.
 * @param kind 'REQ' or 'DL'.
 * @param n The colliding number.
 * @param ids Every entry-ID sharing that number.
 * @returns A human-readable, tool-teaches message.
 */
export function describeNumberCollision(kind: SpecEntryIdKind, n: string, ids: string[]): string {
  return `${labelFor(kind)}-номер ${n} используется ${ids.length} раз в одной спеке: ${ids.join(', ')} — номер обязан быть уникален внутри спеки (используй следующий свободный номер).`;
}
