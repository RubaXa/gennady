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

/**
 * @purpose Parse a `Usage Waiver` line (or its `(external: <consumer>)` variant) inside one
 *   entity's heading block. Reason mandatory; `D-NNN` citation optional.
 * @param specContent Full markdown content of one spec/contract file.
 * @param entityName The entity heading to look inside — bare-name (``### `<entityName>` ``, any
 *   level) or DbC port/adapter/service (``#### Port: `<entityName>` ``, optionally numbered).
 * @returns The parsed waiver, or null when the entity has no heading or no Usage Waiver line, or the reason is empty.
 */
export function parseUsageWaiver(specContent: string, entityName: string): UsageWaiver | null {
  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp('^(#{2,6})[ \\t]+.*`' + escaped + '`.*$', 'm');
  const headingMatch = headingRe.exec(specContent);
  if (!headingMatch) return null;

  const level = (headingMatch[1] as string).length;
  const afterHeading = specContent.slice(headingMatch.index + headingMatch[0].length);
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

    const waiver = waivers.get(sym.name);
    if (!waiver) {
      findings.push({
        severity: 'error',
        code: ERR_CLI_YAGNI_UNDERUSED,
        file: sym.file,
        symbol: sym.name,
        message: `\`${sym.name}\` (${sym.kind}) has ${count} usage(s) in production code (< 2) — YAGNI suspect. Fix: remove it, or — if genuinely needed — add \`- **Usage Waiver:** <reason>\` to its contract/surface entry (cite \`D-NNN — <reason>\` instead only when a Decision Log entry actually backs the reason, and then it must exist; for a public API named to an external consumer use the \`(external: <consumer>)\` variant) and log \`yagni ${sym.name} ← <reason>\` in the Execution Log.`,
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
