// @file: Durable assembly selection stamped into every generated directive tree.
// @consumers: build-directives, check-directives-fresh
// @tasks: N/A

import type { AssemblyMode } from './lazy-assembly.ts';

/** @purpose Project-relative filename that makes generated-tree assembly explicit. */
export const DIRECTIVE_ASSEMBLY_MARKER_FILE = '.gennady-directive-assembly.json';

/** @purpose Selection used to reproduce the generated tree without guessing. */
export type DirectiveAssemblySelection = AssemblyMode | 'manifest';

/** @purpose Versioned generated-tree marker consumed by the freshness gate. */
type DirectiveAssemblyMarker = {
  schema: 'gennady-directive-assembly/v1';
  selection: DirectiveAssemblySelection;
};

/** @purpose Serialize one canonical generated-tree marker. */
export function serializeDirectiveAssemblyMarker(selection: DirectiveAssemblySelection): string {
  return `${JSON.stringify({ schema: 'gennady-directive-assembly/v1', selection }, null, 2)}\n`;
}

/** @purpose Parse the exact marker schema without silently falling back to an assembly. */
export function parseDirectiveAssemblyMarker(
  raw: string
): { ok: true; marker: DirectiveAssemblyMarker } | { ok: false; detail: string } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, detail: 'marker is not valid JSON' };
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded))
    return { ok: false, detail: 'marker must be an object' };
  const value = decoded as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'schema' || keys[1] !== 'selection')
    return { ok: false, detail: 'marker keys must be exactly schema, selection' };
  if (value.schema !== 'gennady-directive-assembly/v1')
    return { ok: false, detail: 'schema must be gennady-directive-assembly/v1' };
  if (value.selection !== 'manifest' && value.selection !== 'monolith' && value.selection !== 'lazy')
    return { ok: false, detail: 'selection must be manifest, monolith, or lazy' };
  return {
    ok: true,
    marker: {
      schema: 'gennady-directive-assembly/v1',
      selection: value.selection,
    },
  };
}
