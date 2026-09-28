// @file: Source-only manifest for the complete embedded built-in rule corpus.
// @consumers: SDD dispatch, sdd-new, sdd-check
// @spec: CLI-RULES

import { readFileSync } from 'node:fs';
import { inspectRepoPath } from '../common/repo-path.ts';
import { createRuleRegistry, type RuleRegistry } from './rule-registry.ts';

/** @purpose Enumerate required built-in prompt locations without duplicating their embedded metadata. */
export const BUILTIN_RULE_SOURCES = Object.freeze([
  'ai/directives/coding/svelte5-runes.xml',
  'ai/directives/coding/sveltekit-rules.xml',
  'ai/directives/coding/typescript-rules.xml',
  'ai/directives/infra/eslint-setup.xml',
  'ai/directives/infra/git-setup.xml',
  'ai/directives/infra/nodejs-npm-setup.xml',
  'ai/directives/infra/storybook-setup.xml',
  'ai/directives/testing/common.xml',
  'ai/directives/testing/node-test.xml',
  'ai/directives/testing/playwright-cli.xml',
  'ai/directives/testing/playwright-e2e.xml',
  'ai/directives/testing/storybook-usage.xml',
  'ai/directives/testing/svelte-testing.xml',
  'ai/directives/testing/vitest-rules.xml',
] as const);

/**
 * @purpose Load the complete built-in layer plus exact plugin/project prompt sources.
 * @invariant The manifest owns only source discovery; all rule metadata remains embedded in prompts.
 * @param root Repository/package root containing the canonical ai/directives tree.
 * @param [additionalSources] Exact repository-local embedded prompts declared by higher layers.
 * @returns One merged lexically validated registry; missing, malformed and duplicate identities fail closed.
 */
export function loadRuleRegistry(
  root: string,
  additionalSources: readonly string[] = []
): RuleRegistry {
  const sources = [...new Set([...BUILTIN_RULE_SOURCES, ...additionalSources])].sort();
  return createRuleRegistry(
    sources.map((source) => {
      const inspected = inspectRepoPath(root, source, 'file');
      if (!inspected.ok) {
        throw new Error(`RULE_REGISTRY_SOURCE_UNAVAILABLE: ${source}: ${inspected.detail}`);
      }
      return {
        source: inspected.relative,
        content: readFileSync(inspected.absolute, 'utf8'),
      };
    })
  );
}

/**
 * @purpose Load only the complete built-in prompt layer for inventory and migration checks.
 * @param root Repository/package root containing the canonical ai/directives tree.
 * @returns One complete lexically validated built-in registry.
 */
export function loadBuiltinRuleRegistry(root: string): RuleRegistry {
  return loadRuleRegistry(root);
}
