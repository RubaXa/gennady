// @file: Built-in plugin registry — the one place a built-in plugin is named for the bundle.
//   Ported verbatim from MAIN (services/stack + plugins, commit d37d5910) as part of SDD v2
//   transfer batch 10 (V-02). UV-04 adds Node symmetrically while its legacy behavior stays owned
//   by the frozen resolvePreset/sdd-verify compatibility path until U4 cutover.
// @spec: CLI-VERIFY
// @consumers: stack-registry, gate-spec-parity test

import type { StackPlugin } from 'gennady/stack';
import { anystackPlugin } from './anystack/anystack-plugin.ts';
import { golangPlugin } from './golang/golang-plugin.ts';
import { nodePlugin } from './node/node-plugin.ts';
import { swiftPlugin } from './swift/swift-plugin.ts';

/**
 * Built-in plugins, statically imported so they reach the published bundle: the shipped CLI
 * runs plain JavaScript and cannot import a plugin's TypeScript entry at runtime (D-SP-009).
 * Order is irrelevant here — the registry sorts by id.
 */
export const BUILTIN_PLUGINS: readonly StackPlugin[] = [
  anystackPlugin,
  golangPlugin,
  nodePlugin,
  swiftPlugin,
];
