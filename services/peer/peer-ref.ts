// @file: Peer reference helpers — qualified runtime:name addressing.
// @spec: PEER
// @consumers: peer-transport-registry, peer.cmd

import type { PeerRuntime, PeerTarget } from './peer-port.ts';

/**
 * @purpose Accepted runtime prefixes mapped to canonical runtimes.
 * @consumer peer-ref
 */
export const RUNTIME_ALIASES: Record<string, PeerRuntime> = {
  claude: 'claude-code',
  'claude-code': 'claude-code',
  cc: 'claude-code',
  oc: 'opencode',
  opencode: 'opencode',
  codex: 'codex',
};

/**
 * @purpose Parsed peer reference.
 * @consumer peer-transport-registry, peer.cmd
 */
export type PeerRef = {
  /** @purpose Canonical runtime when the query was qualified. */
  runtime?: PeerRuntime;
  /** @purpose Remaining name/id query. */
  query: string;
};

/**
 * @purpose Parse `runtime:name` into a runtime and query; bare names stay unqualified.
 */
export const parseRef = (input: string): PeerRef => {
  const match = input.match(/^([A-Za-z][A-Za-z-]*)\s*:\s*(.+)$/);
  if (!match) return { query: input.trim() };
  const runtime = RUNTIME_ALIASES[match[1].toLowerCase()];
  if (!runtime) return { query: input.trim() };
  return { runtime, query: match[2].trim() };
};

/**
 * @purpose Format a target as a qualified `runtime:name` reference.
 */
export const formatRef = (target: PeerTarget): string =>
  `${target.runtime}:${target.name ?? target.id}`;
