// @file: Exact one-rule metadata and opaque prompt body projection.
// @spec: CLI-RULES-CLI
// @consumers: rules.cmd

import { loadBuiltinRuleRegistry } from '../../../shared/rules/builtin-rule-sources.ts';
import { projectRuleInventoryEntry } from './rules-list.ts';
import type { RulesReport } from './rules.types.ts';

type RulesShowReport = Extract<RulesReport, { readonly schema: 'gennady.rules-show.v1' }>;

/**
 * @purpose Return one exact rule or fail closed instead of falling back to inventory.
 * @param root Exact repository root containing the embedded prompt manifest.
 * @param ruleId Exact stable rule identity requested by the caller.
 * @returns Metadata plus the exact opaque prompt body for one rule.
 */
export function showRule(root: string, ruleId: string): RulesShowReport {
  const registry = loadBuiltinRuleRegistry(root);
  const descriptor = registry.get(ruleId);
  if (descriptor === undefined) {
    throw new Error(`RULES_UNKNOWN_RULE: ${ruleId}`);
  }
  return Object.freeze({
    schema: 'gennady.rules-show.v1',
    rule: Object.freeze({ ...projectRuleInventoryEntry(descriptor), body: descriptor.body }),
  });
}
