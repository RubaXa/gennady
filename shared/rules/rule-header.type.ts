// @file: Immutable lexical metadata parsed from one rule prompt header.
// @consumers: RuleRegistry, RuleResolver
// @spec: CLI-RULES

/** @purpose One normalized predicate clause; keys remain data for the later open-vocabulary resolver. */
type RulePredicate = Readonly<Record<string, readonly string[]>>;

/** @purpose Describe the strict metadata header embedded in one opaque rule prompt. */
export type RuleHeader = {
  /** @purpose Literal prompt root tag name used to verify the final close. */
  readonly rootTag: string;
  /** @purpose Stable registry identity from the root `rule-id` attribute. */
  readonly ruleId: string;
  /** @purpose Metadata grammar version from `rule-schema`. */
  readonly ruleSchema: string;
  /** @purpose Rule obligation category. */
  readonly type: string;
  /** @purpose Prompt version from the root `ver` attribute. */
  readonly version: string;
  /** @purpose OR-ed positive clauses; attributes within one clause are AND-ed later. */
  readonly when: readonly RulePredicate[];
  /** @purpose Matching veto clauses evaluated by the later resolver. */
  readonly unless: readonly RulePredicate[];
  /** @purpose Stable rule ids whose deterministic closure is owned by the later resolver. */
  readonly dependsOn: readonly string[];
};
