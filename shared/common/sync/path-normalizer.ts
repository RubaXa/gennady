// @file: PathNormalizer — replaces dev paths with production paths during sync/sync-skills
// @consumers: sync-core.ts, sync-skills-core.ts
// @tasks: D-M005, D-M007

/**
 * @purpose One replacement rule: regex pattern → replacement string.
 * @invariant `from` must have the global flag `g`.
 */
export interface PathNormalizationRule {
  /** @purpose Regex pattern to match. Must carry the `g` flag. */
  from: RegExp;
  /** @purpose Replacement string. */
  to: string;
}

/**
 * @purpose Applies replacement rules to file content sequentially.
 * Rules are applied in array order — from specific to general to avoid conflicts.
 * @param content Raw file content to normalize.
 * @param rules Ordered list of replacement rules.
 * @returns Normalized content with all dev paths replaced by production equivalents.
 */
export function normalize(content: string, rules: readonly PathNormalizationRule[]): string {
  let result = content;
  for (const rule of rules) {
    result = result.replace(rule.from, rule.to);
  }
  return result;
}

// Rules ordered from specific to general to avoid conflicts.
// Order matters: exact CLI patterns first, then skill/directive paths, then general prefixes.

const RULE_CLI_TSX_FULL: PathNormalizationRule = {
  from: /npx\s+tsx\s+~\/Developer\/gennady\/cli\/gennady\.ts\b/g,
  to: 'npx gennady',
};

const RULE_CLI_TSX_SHORT: PathNormalizationRule = {
  from: /npx tsx ~\/Developer\/gennady\/cli[ \t]+/g,
  to: 'npx gennady ',
};

const RULE_CLI_TILDE: PathNormalizationRule = {
  from: /~\/Developer\/gennady\/cli\/gennady\.ts/g,
  to: 'npx gennady',
};

const RULE_SKILLS_TILDE: PathNormalizationRule = {
  from: /~\/Developer\/gennady\/ai\/skills\//g,
  to: '.claude/skills/',
};

const RULE_DIRECTIVES_TILDE: PathNormalizationRule = {
  from: /~\/Developer\/gennady\/ai\/directives\//g,
  to: 'ai/directives/',
};

const RULE_AI_ABS: PathNormalizationRule = {
  from: /\/Users\/k\.lebedev\/Developer\/gennady\/ai\//g,
  to: 'ai/',
};

const RULE_CLI_ABS: PathNormalizationRule = {
  from: /\/Users\/k\.lebedev\/Developer\/gennady\/cli\/gennady\.ts/g,
  to: 'npx gennady',
};

const RULE_CLI_HOME: PathNormalizationRule = {
  from: /\$HOME\/Developer\/gennady\/cli\/gennady\.ts\b/g,
  to: '~/Developer/gennady/cli/gennady.ts',
};

/** @purpose Path rules for `sync` (ai/directives/): directive and CLI paths only. */
export const SYNC_PATH_RULES: readonly PathNormalizationRule[] = [
  RULE_CLI_TSX_FULL,
  RULE_CLI_TSX_SHORT,
  RULE_CLI_TILDE,
  RULE_DIRECTIVES_TILDE,
  RULE_AI_ABS,
  RULE_CLI_ABS,
  RULE_CLI_HOME,
];

/** @purpose Path rules for `sync-skills` (ai/skills/): all rules, including skill path replacement. */
export const SYNC_SKILLS_PATH_RULES: readonly PathNormalizationRule[] = [
  RULE_CLI_TSX_FULL,
  RULE_CLI_TSX_SHORT,
  RULE_CLI_TILDE,
  RULE_SKILLS_TILDE,
  RULE_DIRECTIVES_TILDE,
  RULE_AI_ABS,
  RULE_CLI_ABS,
  RULE_CLI_HOME,
];
