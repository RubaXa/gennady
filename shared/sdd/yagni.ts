// @file: Pure YAGNI usage-check logic — < 2 usages and whether a Usage Waiver gates it. Extraction + IO stay in the yagni command.
// @consumers: yagni.cmd
// @tasks: N/A

/** @purpose One symbol added or modified by the diff under check. */
export type ChangedSymbol = {
  /** @purpose Symbol name. */
  name: string;
  /** @purpose Declaration kind (informational — see DeclaredSymbol.kind). */
  kind: string;
  /** @purpose File the symbol was declared in. */
  file: string;
  /** @purpose True when the declaration is exported — a private symbol is suspect only at zero usages. */
  exported: boolean;
};

/** @purpose A parsed `- **Usage Waiver:** <reason>` (or `D-NNN — <reason>`, or the `(external: <consumer>)` variant). */
export type UsageWaiver = {
  /** @purpose Cited Decision Log id, e.g. `D-042` — present only when the label cites one; a waiver without a citation still gates. */
  decision?: string;
  /** @purpose Waiver reason text. */
  reason: string;
  /** @purpose Named external consumer, for the public-API waiver variant — undefined otherwise. */
  external?: string;
};

/** @purpose One YAGNI finding, ESLint-shaped like `gennady lint`'s LintError. */
export type YagniFinding = {
  /** @purpose Always 'error' — an ungated underused symbol blocks the gate (D-YG004: strict for all entities, diff scope has no legacy). */
  severity: 'error';
  /** @purpose ERR_CLI_YAGNI_* code. */
  code: string;
  /** @purpose File the finding refers to. */
  file: string;
  /** @purpose The symbol name the finding is about. */
  symbol: string;
  /** @purpose Description with the issue and the fix. */
  message: string;
};

/** @purpose Symbol has < 2 production-code usages and no Usage Waiver gates it. */
export const ERR_CLI_YAGNI_UNDERUSED = 'ERR_CLI_YAGNI_UNDERUSED' as const;
/** @purpose Symbol has a Usage Waiver, but the cited D-NNN has no Decision Log heading anywhere in the repo. */
export const ERR_CLI_YAGNI_WAIVER_DECISION_MISSING =
  'ERR_CLI_YAGNI_WAIVER_DECISION_MISSING' as const;

/** @purpose Minimum production-code usage count before a changed/added symbol is YAGNI-suspect. */
const MIN_USAGE = 2;

/**
 * @purpose Strip barrel re-export lines (`export { X } from '...'` / `export * from '...'`) —
 *   a re-export is not a usage.
 * @param content Source text.
 * @returns `content` with every top-level re-export line blanked out (line count preserved).
 */
export function stripBarrelReexports(content: string): string {
  return content.replace(/^[ \t]*export\s*(?:\*|\{[^}]*\})\s*from\s*['"][^'"]+['"];?[ \t]*$/gm, '');
}

/** @purpose The only spec sections a Usage Waiver may legally live in — contract/surface bodies, never Decision Log / Execution Log / free-form prose. */
const WAIVER_SECTIONS = ['MODULE_CONTRACTS', 'ENTITY_SURFACES', 'PUBLIC_API_SURFACE'];

/**
 * @purpose Byte spans of the given `<!--SECTION:X--> ... <!--/SECTION:X-->` blocks in `content`.
 * @param content Full markdown content.
 * @param names Section names to collect spans for.
 * @returns One `[start, end)` span per matching section block found, unsorted.
 */
function sectionSpans(content: string, names: readonly string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const name of names) {
    const re = new RegExp(
      '<!--SECTION:' + name + '-->([\\s\\S]*?)<!--/SECTION:' + name + '-->',
      'g'
    );
    for (const m of content.matchAll(re)) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

/**
 * @purpose Parse a `Usage Waiver` line inside one entity's heading, gated to a contract/surface
 *   section (`WAIVER_SECTIONS`) — never a Decision Log entry.
 * @param specContent Full markdown content of one spec/contract file.
 * @param entityName The entity heading to look inside — bare-name (``### `<entityName>` ``, any
 *   level) or DbC port/adapter/service (``#### Port: `<entityName>` ``, optionally numbered).
 * @returns The parsed waiver, or null when the entity has no in-scope heading or no Usage Waiver line, or the reason is empty.
 */
export function parseUsageWaiver(specContent: string, entityName: string): UsageWaiver | null {
  const hasAnySection = /<!--SECTION:[A-Z_]+-->/.test(specContent);
  const legalSpans = hasAnySection ? sectionSpans(specContent, WAIVER_SECTIONS) : null;
  const inLegalScope = (index: number): boolean =>
    !legalSpans || legalSpans.some(([start, end]) => index >= start && index < end);

  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp('^(#{2,6})[ \\t]+.*`' + escaped + '`.*$', 'gm');
  let headingMatch: RegExpExecArray | null;
  let chosen: RegExpExecArray | null = null;
  while ((headingMatch = headingRe.exec(specContent))) {
    if (inLegalScope(headingMatch.index)) {
      chosen = headingMatch;
      break;
    }
  }
  if (!chosen) return null;

  const level = (chosen[1] as string).length;
  const afterHeading = specContent.slice(chosen.index + chosen[0].length);
  const nextHeadingRe = new RegExp('^#{1,' + level + '}[ \\t]', 'm');
  const nextHeadingMatch = nextHeadingRe.exec(afterHeading);
  const block = afterHeading.slice(0, nextHeadingMatch ? nextHeadingMatch.index : undefined);
  const m =
    /-\s*\*\*Usage Waiver(?:\s*\(external:\s*([^)]+)\))?:\*\*\s*(?:(D-[A-Za-z0-9]+)\s*[—-]\s*)?(.+)/.exec(
      block
    );
  if (!m) return null;
  const reason = (m[3] ?? '').trim();
  if (!reason) return null;
  const external = m[1]?.trim();
  const decision = m[2];
  const base: UsageWaiver = decision ? { decision, reason } : { reason };
  return external ? { ...base, external } : base;
}

/**
 * @purpose Whether a Decision Log heading for `decisionId` exists anywhere in `content` (``### D-NNN — ...``).
 * @param content Markdown content to search.
 * @param decisionId Decision id, e.g. `D-042`.
 * @returns True when a matching heading is found.
 */
export function hasDecisionHeading(content: string, decisionId: string): boolean {
  const escaped = decisionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^###\\s*' + escaped + '\\b', 'm').test(content);
}

/**
 * @purpose YAGNI usage check — an underused symbol is a finding unless a Usage Waiver gates it.
 * @invariant Tests never count as usage — callers exclude test files from `usageCounts`.
 * @invariant A waiver with no `D-NNN` citation gates unconditionally — the reason alone is enough.
 * @invariant An unresolvable `D-NNN` citation does NOT gate the finding — it downgrades to a more
 *   specific finding instead of silently passing.
 * @param changed Symbols added/modified in the diff.
 * @param usageCounts Symbol name → usage count in production code across the whole repo (the symbol's own declaration occurrence already excluded).
 * @param waivers Symbol name → parsed Usage Waiver, when its contract declares one.
 * @param liveDecisions Decision ids confirmed to have a Decision Log heading somewhere in the repo.
 * @returns One finding per underused, ungated symbol.
 */
export function checkYagniUsage(
  changed: ChangedSymbol[],
  usageCounts: Map<string, number>,
  waivers: Map<string, UsageWaiver>,
  liveDecisions: Set<string>
): YagniFinding[] {
  const findings: YagniFinding[] = [];
  for (const sym of changed) {
    const count = usageCounts.get(sym.name) ?? 0;
    if (count >= MIN_USAGE) continue;
    // A private (non-exported) symbol used at least once is ordinary decomposition — a named
    // constant or extracted helper, not speculative surface. Only a ZERO-usage private is dead code.
    if (!sym.exported && count >= 1) continue;

    const waiver = waivers.get(sym.name);
    if (!waiver) {
      findings.push({
        severity: 'error',
        code: ERR_CLI_YAGNI_UNDERUSED,
        file: sym.file,
        symbol: sym.name,
        message: [
          `\`${sym.name}\` (${sym.kind}${sym.exported ? '' : ', private'}) has ${count} usage(s) in production code${sym.exported ? ' (< 2)' : ' (dead code)'} — YAGNI suspect.`,
          `Fix: remove it — or, if genuinely needed, paste this under \`${sym.name}\`'s entity heading`,
          'in MODULE_CONTRACTS / ENTITY_SURFACES / PUBLIC_API_SURFACE (never Decision Log):',
          `  - **Usage Waiver:** <reason — почему \`${sym.name}\` нужен несмотря на < 2 использований>`,
          '(cite `D-NNN — <reason>` only when a Decision Log entry backs it — and it must then exist;',
          'for a public API named to one external consumer, use the `(external: <consumer>)` variant instead.)',
          `Then log in the ticket's Execution Log: yagni ${sym.name} ← <reason>`,
        ].join('\n'),
      });
      continue;
    }

    if (waiver.decision && !liveDecisions.has(waiver.decision)) {
      findings.push({
        severity: 'error',
        code: ERR_CLI_YAGNI_WAIVER_DECISION_MISSING,
        file: sym.file,
        symbol: sym.name,
        message: `\`${sym.name}\` has a Usage Waiver citing ${waiver.decision}, but no Decision Log entry with that id was found anywhere in the repo — an unresolvable citation does not gate the finding. Fix: add the ${waiver.decision} entry to a Decision Log, correct the citation, or drop the citation if the reason does not need one.`,
      });
    }
  }
  return findings;
}
