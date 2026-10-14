// @file: Built-in plugin registry — the one place a built-in plugin is named for the bundle.
// @consumers: stack-registry, gate-spec-parity test, plugin-locality test
// @tasks: TSK-96

import type { StackPlugin } from 'gennady/stack';
import { anystackPlugin } from './anystack/anystack-plugin.ts';
import { golangPlugin } from './golang/golang-plugin.ts';
import { nodePlugin } from './node/node-plugin.ts';

/**
 * Built-in plugins, statically imported so they reach the published bundle: the shipped CLI
 * runs plain JavaScript and cannot import a plugin's TypeScript entry at runtime (D-SP-009).
 * Order is irrelevant here — the registry sorts by id.
 */
export const BUILTIN_PLUGINS: readonly StackPlugin[] = [anystackPlugin, golangPlugin, nodePlugin];
