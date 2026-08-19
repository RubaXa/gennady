// @file: Built-in plugin registry — the one place a built-in plugin is named for the bundle.
// @consumers: stack-registry, gate-spec-parity test, plugin-locality test
// @tasks: TSK-96

import type { StackPlugin } from 'gennady/stack';
import { golangPlugin } from './golang/golang-plugin.ts';
// node has not moved into plugins/ yet — one line changes when it does (plugins.spec §10, step 6).
import { nodePlugin } from '../services/stack/plugins/node/node-plugin.ts';

/**
 * Built-in plugins, statically imported so they reach the published bundle: the shipped CLI
 * runs plain JavaScript and cannot import a plugin's TypeScript entry at runtime (D-SP-009).
 * Order is irrelevant here — the registry sorts by id.
 */
export const BUILTIN_PLUGINS: readonly StackPlugin[] = [golangPlugin, nodePlugin];
