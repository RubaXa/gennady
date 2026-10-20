// @file: Gennady peer alias registry — stable name → sessionId bindings under ~/.gennady/peer.
// @spec: PEER
// @consumers: peer.cmd

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * @purpose A remembered peer binding so a renamed session stays addressable.
 * @consumer peer-store, peer.cmd
 */
export type PeerAlias = {
  /** @purpose Logical name used on the command line. */
  name: string;
  /** @purpose Runtime the peer belongs to. */
  runtime?: string;
  /** @purpose Stable transcript session id. */
  sessionId?: string;
  /** @purpose Role in a managed group. */
  role?: 'leader' | 'subordinate';
  /** @purpose Group name, if any. */
  group?: string;
  /** @purpose Last observed pid. */
  lastPid?: number;
  /** @purpose Last observed inbox socket. */
  socketPath?: string;
  /** @purpose Last observed working directory. */
  cwd?: string;
  /** @purpose First time the alias was recorded (epoch ms). */
  addedAt: number;
};

/**
 * @purpose Shape of the on-disk registry.
 * @consumer peer-store
 */
export type PeerRegistry = {
  /** @purpose Aliases keyed by name. */
  peers: Record<string, PeerAlias>;
};

/**
 * @purpose Root directory for gennady peer state.
 */
export const gennadyHome = (): string => process.env.GENNADY_HOME ?? join(homedir(), '.gennady');

/**
 * @purpose Directory holding the peer registry.
 */
export const peerStateDir = (): string => join(gennadyHome(), 'peer');

/**
 * @purpose Path to the alias registry file.
 */
export const registryPath = (): string => join(peerStateDir(), 'registry.json');

/**
 * @purpose Read the alias registry; missing/corrupt file yields an empty registry.
 */
export const readRegistry = (): PeerRegistry => {
  try {
    const parsed = JSON.parse(readFileSync(registryPath(), 'utf8')) as PeerRegistry;
    return parsed.peers ? parsed : { peers: {} };
  } catch {
    return { peers: {} };
  }
};

/**
 * @purpose Persist the alias registry.
 */
export const writeRegistry = (registry: PeerRegistry): void => {
  mkdirSync(peerStateDir(), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2));
};

/**
 * @purpose Insert or update an alias.
 */
export const putPeer = (alias: PeerAlias): PeerAlias => {
  const registry = readRegistry();
  const existing = registry.peers[alias.name];
  const merged: PeerAlias = { ...existing, ...alias, addedAt: existing?.addedAt ?? alias.addedAt };
  registry.peers[alias.name] = merged;
  writeRegistry(registry);
  return merged;
};

/**
 * @purpose Look up an alias by name.
 */
export const getPeer = (name: string): PeerAlias | undefined => readRegistry().peers[name];

/**
 * @purpose Remove an alias.
 */
export const forgetPeer = (name: string): boolean => {
  const registry = readRegistry();
  if (!(name in registry.peers)) return false;
  delete registry.peers[name];
  writeRegistry(registry);
  return true;
};

/**
 * @purpose List all aliases, newest first.
 */
export const listPeers = (): PeerAlias[] =>
  Object.values(readRegistry().peers).sort((a, b) => b.addedAt - a.addedAt);
