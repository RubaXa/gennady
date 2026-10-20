// @file: Peer transport registry — resolve a runtime adapter by id or auto-detect.
// @consumers: peer.cmd
// @tasks: N/A

import { ClaudeCodeTransport } from './claude-code/claude-code.transport.ts';
import { OpenCodeTransport } from './opencode/opencode.transport.ts';
import { CodexTransport } from './codex/codex.transport.ts';
import { parseRef } from './peer-ref.ts';
import { getPeer } from './peer-store.ts';
import type { PeerRuntime, PeerTarget, PeerTransport } from './peer-port.ts';

const transports = new Map<PeerRuntime, PeerTransport>();

/**
 * @purpose Register a transport adapter.
 */
export const registerTransport = (transport: PeerTransport): void => {
  transports.set(transport.runtime, transport);
};

/**
 * @purpose Get the adapter for a runtime.
 */
export const getTransport = (runtime: PeerRuntime): PeerTransport | undefined =>
  transports.get(runtime);

/**
 * @purpose List registered adapters.
 */
export const listTransports = (): PeerTransport[] => [...transports.values()];

/**
 * @purpose The adapter used when the caller does not name a runtime.
 */
export const defaultTransport = (): PeerTransport => {
  const claude = transports.get('claude-code');
  if (!claude) throw new Error('No default peer transport registered');
  return claude;
};

/**
 * @purpose Resolve a target by trying the default adapter first, then the rest.
 */
export const resolveAny = async (query: string): Promise<PeerTarget | undefined> => {
  const ordered = [defaultTransport(), ...listTransports()];
  for (const transport of ordered) {
    const target = await transport.resolve(query);
    if (target) return target;
  }
  return undefined;
};

/**
 * @purpose Outcome of a qualified resolution.
 */
export type ResolveRefResult = {
  /** @purpose Single resolved target. */
  target?: PeerTarget;
  /** @purpose Conflicting matches when a bare name is ambiguous across runtimes. */
  ambiguous?: PeerTarget[];
};

/**
 * @purpose Resolve a `runtime:name` reference; bare names must be unambiguous across runtimes.
 */
export const resolveRef = async (input: string): Promise<ResolveRefResult> => {
  const { runtime, query } = parseRef(input);

  // Alias lookup: a registered name resolves to its runtime + stable id.
  const alias = getPeer(runtime ? query : input);
  if (alias?.runtime && alias.sessionId) {
    const transport = getTransport(alias.runtime as PeerRuntime);
    const target = transport ? await transport.resolve(alias.sessionId) : undefined;
    if (target) return { target };
  }

  if (runtime) {
    const transport = getTransport(runtime);
    const target = transport ? await transport.resolve(query) : undefined;
    return target ? { target } : {};
  }
  const found = (
    await Promise.all(listTransports().map(async (transport) => transport.resolve(query)))
  ).filter((target): target is PeerTarget => Boolean(target));
  if (found.length === 0) return {};
  if (found.length === 1) return { target: found[0] };
  return { ambiguous: found };
};

// Default registration: Claude Code, OpenCode, Codex (read-only).
registerTransport(new ClaudeCodeTransport());
registerTransport(new OpenCodeTransport());
registerTransport(new CodexTransport());
