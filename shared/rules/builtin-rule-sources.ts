// @file: Source-only manifest for the complete embedded built-in rule corpus.
// @consumers: SDD dispatch, sdd-new, sdd-check
// @spec: CLI-RULES

import { proveRepoFile, readProvenRepoFile } from '../common/repo-file-identity.ts';
import { createRuleRegistry, type RuleRegistry } from './rule-registry.ts';

/** @purpose Enumerate required built-in prompt locations without duplicating their embedded metadata. */
export const BUILTIN_RULE_SOURCES = Object.freeze([
  'ai/directives/coding/baseline-rules.xml',
  'ai/directives/coding/go-rules.xml',
  'ai/directives/coding/python-rules.xml',
  'ai/directives/coding/svelte5-runes.xml',
  'ai/directives/coding/sveltekit-rules.xml',
  'ai/directives/coding/typescript-rules.xml',
  'ai/directives/infra/eslint-setup.xml',
  'ai/directives/infra/git-setup.xml',
  'ai/directives/infra/nodejs-npm-setup.xml',
  'ai/directives/infra/storybook-setup.xml',
  'ai/directives/testing/baseline-testing.xml',
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
      const proof = proveRepoFile(root, source);
      if (!proof.ok)
        throw new Error(`RULE_REGISTRY_SOURCE_UNAVAILABLE: ${source}: ${proof.detail}`);
      const read = readProvenRepoFile(proof.identity);
      if (!read.ok) throw new Error(`RULE_REGISTRY_SOURCE_UNAVAILABLE: ${source}: ${read.detail}`);
      return {
        source: proof.identity.relative,
        content: read.content,
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
