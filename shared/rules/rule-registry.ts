// @file: Deterministic immutable inventory of lexically parsed rule prompts.
// @consumers: RuleResolver, rules CLI
// @spec: CLI-RULES

import type { RuleDescriptor } from './rule-descriptor.type.ts';
import { parseRuleHeader } from './rule-header.parser.ts';

type RuleSource = {
  readonly source: string;
  readonly content: string;
};

/** @purpose Read-only deterministic inventory across built-in, plugin and project rule sources. */
export type RuleRegistry = {
  /**
   * @purpose List descriptors in stable rule-id order.
   * @returns The same frozen descriptor collection for the registry lifetime.
   */
  readonly list: () => readonly RuleDescriptor[];
  /**
   * @purpose Retrieve one exact descriptor without implicit fallback.
   * @param ruleId Stable rule identity to look up.
   * @returns Exact descriptor or undefined when that id is absent.
   */
  readonly get: (ruleId: string) => RuleDescriptor | undefined;
};

/**
 * @purpose Load all required prompt sources fail-closed into one deterministic immutable registry.
 * @param sources Caller-discovered required sources; input order has no semantic effect.
 * @returns Frozen registry whose list order depends only on normalized rule ids.
 */
export function createRuleRegistry(sources: readonly RuleSource[]): RuleRegistry {
  const orderedSources = [...sources].sort((left, right) =>
    left.source.localeCompare(right.source)
  );
  const seenSources = new Set<string>();
  const byId = new Map<string, RuleDescriptor>();
  for (const source of orderedSources) {
    if (seenSources.has(source.source)) {
      throw new Error(`RULE_REGISTRY_DUPLICATE_SOURCE: ${source.source}`);
    }
    seenSources.add(source.source);
    const descriptor = parseRuleHeader(source.source, source.content);
    const previous = byId.get(descriptor.ruleId);
    if (previous !== undefined) {
      throw new Error(
        `RULE_REGISTRY_DUPLICATE_ID: ${descriptor.ruleId}: ${previous.source}, ${descriptor.source}`
      );
    }
    byId.set(descriptor.ruleId, descriptor);
  }
  const descriptors = Object.freeze(
    [...byId.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId))
  );
  return Object.freeze({
    list: () => descriptors,
    get: (ruleId: string) => byId.get(ruleId),
  });
}
