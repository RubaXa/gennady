// @file: Built-in plugin registry — the one place a built-in plugin is named for the bundle.
// @consumers: stack-registry, gate-spec-parity test
// @tasks: V-02
//
// Ported verbatim from MAIN (services/stack + plugins, commit d37d5910) as part of SDD v2
// transfer batch 10 (V-02). MAIN's registry also lists `nodePlugin`; the node stack keeps its
// existing RC-native implementation (`shared/sdd/phase-verification-plan.ts`, locked by the V-01
// golden) and gets its own preset in V-04 instead of an anystack/golang-style plugin, so it is
// deliberately not part of this index yet.

import type { StackPlugin } from 'gennady/stack';
import { anystackPlugin } from './anystack/anystack-plugin.ts';
import { golangPlugin } from './golang/golang-plugin.ts';

/**
 * Built-in plugins, statically imported so they reach the published bundle: the shipped CLI
 * runs plain JavaScript and cannot import a plugin's TypeScript entry at runtime (D-SP-009).
 * Order is irrelevant here — the registry sorts by id.
 */
export const BUILTIN_PLUGINS: readonly StackPlugin[] = [anystackPlugin, golangPlugin];
