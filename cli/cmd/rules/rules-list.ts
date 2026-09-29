// @file: Deterministic full built-in RuleRegistry inventory projection.
// @spec: CLI-RULES-CLI
// @consumers: rules.cmd

import { loadBuiltinRuleRegistry } from '../../../shared/rules/builtin-rule-sources.ts';
import type { RuleDescriptor } from '../../../shared/rules/rule-descriptor.type.ts';
import type { RulesReport } from './rules.types.ts';

type RulesListReport = Extract<RulesReport, { readonly schema: 'gennady.rules-list.v1' }>;
type RuleInventoryEntry = RulesListReport['rules'][number];

/**
 * @purpose Project one already-loaded descriptor without another registry or filesystem read.
 * @param rule Exact immutable descriptor from one RuleRegistry load.
 * @returns Stable safe inventory metadata for the same prompt bytes.
 */
export function projectRuleInventoryEntry(rule: RuleDescriptor): RuleInventoryEntry {
  return Object.freeze({
    id: rule.ruleId,
    source: rule.source,
    ruleSchema: rule.ruleSchema,
    type: rule.type,
    version: rule.version,
    when: rule.when,
    unless: rule.unless,
    dependsOn: rule.dependsOn,
    availability: 'available',
    provenance: 'builtin-manifest',
    bodyDigest: rule.bodyDigest,
  });
}

/**
 * @purpose Project one complete deterministic inventory without selection or scope inference.
 * @param root Exact repository root containing the built-in embedded prompt manifest.
 * @returns Stable rule-id-ordered inventory with source/provenance/availability metadata.
 */
export function listRules(root: string): RulesListReport {
  return Object.freeze({
    schema: 'gennady.rules-list.v1',
    rules: Object.freeze(loadBuiltinRuleRegistry(root).list().map(projectRuleInventoryEntry)),
  });
}
