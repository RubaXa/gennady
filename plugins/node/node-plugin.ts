// @file: Symmetric Node StackPlugin with legacy compatibility and target Verify facets.
// @consumers: built-in plugin registry, node target planner
// @spec: CLI-VERIFY

import type { StackDetection, StackPlugin } from 'gennady/stack';
import { detectNodeProject } from './node-project.logic.ts';
import { createNodeVerifyPreset, evaluateNodeReadiness } from './node-target.logic.ts';

/**
 * @purpose Node participates in the same built-in registry and target-preset contract as every stack.
 * @invariant The legacy facet remains empty in UV-04; existing resolvePreset/sdd-verify owns legacy
 *   behavior until U4 cutover, while target planning uses `target` exclusively.
 */
export const nodePlugin: StackPlugin = {
  id: 'node',
  marker: 'package.json',
  description: 'Node package scripts as one target VerifyPreset DAG with selected-slice readiness',
  gateIds: [],
  detect(root): StackDetection | null {
    const facts = detectNodeProject(root);
    if (facts === null) return null;
    return {
      stack: 'node',
      root,
      // Keep the legacy detection projection byte-compatible; target readiness owns package facts.
      summary: ['marker:     package.json'],
      diagnostics: [],
      details: facts,
    };
  },
  verify: {
    resolveScope(_detection, request) {
      return {
        mode: request.mode,
        note: 'legacy Node planning remains owned by resolvePreset until U4 cutover',
        details: null,
      };
    },
    planGates() {
      return [];
    },
  },
  target: {
    affectsScope(_detection, scope) {
      if (scope.mode === 'all' || scope.files.length === 0) return true;
      return scope.files.some(
        (file) =>
          /\.(?:[cm]?[jt]sx?|jsonc?|mdx?|ya?ml|css|scss|html)$/.test(file) ||
          /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig(?:\.[^/]+)?\.json|eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.[^/]+)?|\.prettierrc(?:\.[^/]+)?)$/.test(
            file
          )
      );
    },
    createPreset: createNodeVerifyPreset,
    evaluateReadiness: evaluateNodeReadiness,
  },
};
