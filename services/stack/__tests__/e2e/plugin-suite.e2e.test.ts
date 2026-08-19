// @file: Generic plugin e2e suite entry — resolves one plugin by id and runs its own fixtures.
// @consumers: scripts/stack-e2e.ts
// @tasks: TSK-96

import path from 'node:path';
import { declareStackSuite } from './suite.ts';
import { resolvePlugins } from '../../../plugins/resolve-plugins.ts';

/**
 * @purpose Resolve one plugin by id and declare its fixture suite.
 * @param suiteId Plugin id naming the suite to run.
 * @sideEffect Registers node:test suites for that plugin's fixtures.
 */
function declarePluginSuite(suiteId: string): void {
  const repoRoot = path.resolve(import.meta.dirname, '../../../..');
  const { plugins, errors } = resolvePlugins([path.join(repoRoot, 'plugins')], 'stack');
  if (errors.length > 0) {
    throw new Error(
      `[plugin-suite] cannot resolve plugins: ${errors.map((e) => e.path).join(', ')}`
    );
  }

  const plugin = plugins.find((candidate) => candidate.id === suiteId);
  if (plugin === undefined) {
    throw new Error(
      `[plugin-suite] no plugin "${suiteId}" — resolved: ${plugins.map((p) => p.id).join(', ') || 'none'}`
    );
  }
  if (plugin.e2eFixtures === null) {
    throw new Error(`[plugin-suite] plugin "${suiteId}" declares no e2eFixtures`);
  }

  declareStackSuite(plugin.id, plugin.e2eFixtures);
}

const suiteId = process.env.STACK_E2E_SUITE ?? '';

// `npm test` collects this file too. Outside an e2e run there is no suite to declare and
// nothing to complain about; inside one, a missing or unknown id must fail loudly.
if (process.env.STACK_E2E === '1') {
  if (suiteId.length === 0) {
    throw new Error('[plugin-suite] STACK_E2E_SUITE must name the plugin whose suite to run');
  }
  declarePluginSuite(suiteId);
}
