// @file: Path-aware, copy-ready literals printed after sdd-new creates a task.
// @consumers: SddNewCommand
// @tasks: N/A

import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectHeadings, headingSlug } from './section.ts';

/** @purpose Maximum copy-ready contract anchors emitted for one owning spec. */
export const CONTRACT_ANCHOR_LIMIT = 40;
const CONTRACT_HEADING = /^(Service|Port|Adapter|Component|Pattern|Value Object|Entity):\s+(.+)$/;

/** @purpose One structurally typed contract heading and its canonical Markdown slug. */
type ContractAnchor = {
  /** @purpose Human-readable typed heading without Markdown code punctuation. */
  label: string;
  /** @purpose Canonical Markdown heading slug used in the link fragment. */
  slug: string;
};

/**
 * @purpose Derive a bounded, unambiguous contract-anchor list from canonical typed headings.
 * @param content Owning spec bytes.
 * @returns Contract headings in document order; empty is explicit and valid.
 */
function parseContractAnchors(content: string): ContractAnchor[] {
  const anchors = collectHeadings(content).flatMap((heading) => {
    const match = CONTRACT_HEADING.exec(heading.text);
    if (!match) return [];
    return [{ label: heading.text.replace(/`/g, ''), slug: headingSlug(heading.text) }];
  });
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (seen.has(anchor.slug))
      throw new Error(`duplicate contract heading slug '#${anchor.slug}' in owning spec`);
    seen.add(anchor.slug);
  }
  if (anchors.length > CONTRACT_ANCHOR_LIMIT)
    throw new Error(
      `owning spec has ${anchors.length} contract anchors; cap is ${CONTRACT_ANCHOR_LIMIT}. Split the contract surface through its owning spec flow, then repeat the same task call`
    );
  return anchors;
}

/** @purpose One canonical rule ID/file tuple from ai/directives/knowledge.xml. */
export type RuleRegistryEntry = {
  /** @purpose Canonical rule identity used in ticket Rules lists. */
  id: string;
  /** @purpose Repository-relative directive path declared by the registry. */
  file: string;
};

/**
 * @purpose Parse rule ID/file tuples from the sole canonical knowledge registry.
 * @param content Full ai/directives/knowledge.xml text.
 * @returns Complete unique rule ID/file tuples in registry order.
 */
export function parseRuleRegistry(content: string): RuleRegistryEntry[] {
  const entries = [...content.matchAll(/<Rule\s+id="([^"]+)">([\s\S]*?)<\/Rule>/g)].flatMap(
    (match) => {
      const file = /<File>([^<]+)<\/File>/.exec(match[2] ?? '')?.[1]?.trim();
      return file ? [{ id: match[1] as string, file }] : [];
    }
  );
  if (entries.length === 0)
    throw new Error('no complete <Rule id="…"><File>…</File></Rule> entries');
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate rule id "${entry.id}"`);
    ids.add(entry.id);
  }
  return entries;
}

/**
 * @purpose Load the canonical rule registry from one repository root.
 * @param repoRoot Repository whose synced registry should be preferred.
 * @returns Complete unique rule ID/file tuples from project or package registry.
 */
export function loadRuleRegistry(repoRoot: string): RuleRegistryEntry[] {
  const projectRegistry = posix.join(repoRoot.replace(/\\/g, '/'), 'ai/directives/knowledge.xml');
  if (existsSync(projectRegistry)) {
    return parseRuleRegistry(readFileSync(projectRegistry, 'utf-8'));
  }
  const packageRegistry = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../ai/directives/knowledge.xml'
  );
  return parseRuleRegistry(readFileSync(packageRegistry, 'utf-8'));
}

/**
 * @purpose Make one repository-relative target a Markdown href relative to the actual ticket.
 * @param ticketPath Repository-relative path of the created ticket.
 * @param targetPath Repository-relative path of the linked artifact.
 * @returns POSIX Markdown href relative to the ticket directory.
 */
export function ticketRelativeHref(ticketPath: string, targetPath: string): string {
  const href = relative(dirname(ticketPath), targetPath).replace(/\\/g, '/');
  return href.startsWith('.') ? href : `./${href}`;
}

/** @purpose Canonical complete Deferred Test Ownership row accepted by BDD coverage parsing. */
export const DEFERRED_TEST_OWNERSHIP_LITERAL =
  '- Deferred Test Ownership: <other-Task-ID> <scenario name> → `<future-test-file>` :: `<canonical case name>`';

/**
 * @purpose Render path-aware authoring literals for one newly-created task.
 * @param ticketPath Repository-relative path of the created ticket.
 * @param owningSpecPath Repository-relative canonical owning-spec path.
 * @param rules Canonical rule registry entries.
 * @param [owningSpecContent] Owning spec bytes used to derive typed contract anchors.
 * @returns Copy-ready owning spec, rule tuple, and deferred-ownership literals.
 */
export function renderTaskAuthoringLiterals(
  ticketPath: string,
  owningSpecPath: string,
  rules: RuleRegistryEntry[],
  owningSpecContent = ''
): string {
  const owningHref = ticketRelativeHref(ticketPath, owningSpecPath);
  const contractAnchors = parseContractAnchors(owningSpecContent);
  return [
    'task-authoring-literals (copy exactly; choose applicable rules, replace angle-bracket values):',
    `  owning-spec: [Owning spec](${owningHref})`,
    '  contract-anchors:',
    ...(contractAnchors.length > 0
      ? contractAnchors.map((anchor) => `    - [${anchor.label}](${owningHref}#${anchor.slug})`)
      : ['    - none (owning spec has no typed contract-bearing headings)']),
    '  rule-tuples:',
    ...rules.map((rule) => `    - [${rule.id}](${ticketRelativeHref(ticketPath, rule.file)})`),
    `  deferred-test-ownership: ${DEFERRED_TEST_OWNERSHIP_LITERAL}`,
    '  deferred-test-ownership-not-applicable: contract-level typing scenarios and scenarios owned by this ticket',
  ].join('\n');
}
