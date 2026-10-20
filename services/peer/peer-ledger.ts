// @file: Peer ledger — append-only audit log of cross-session messages.
// @consumers: peer-invoker, peer.cmd
// @tasks: N/A

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gennadyHome } from './peer-store.ts';

/**
 * @purpose One recorded message in the peer ledger.
 * @consumer peer-invoker, peer.cmd
 */
export type LedgerEntry = {
  /** @purpose Epoch ms. */
  ts: number;
  /** @purpose Direction: outbound to a peer or inbound reply. */
  dir: 'out' | 'in';
  /** @purpose Peer runtime. */
  runtime: string;
  /** @purpose Peer id/name. */
  target: string;
  /** @purpose Label of the message kind. */
  kind: string;
  /** @purpose Channel that produced the reply. */
  source?: string;
  /** @purpose Message text. */
  text: string;
};

/**
 * @purpose Directory holding peer ledgers.
 */
export const ledgerDir = (): string => join(gennadyHome(), 'peer');

/**
 * @purpose Path to a group ledger.
 */
export const ledgerPath = (group = 'default'): string => join(ledgerDir(), `${group}.jsonl`);

/**
 * @purpose Append an entry to the group ledger.
 */
export const appendLedger = (entry: LedgerEntry, group = 'default'): void => {
  mkdirSync(ledgerDir(), { recursive: true });
  appendFileSync(ledgerPath(group), `${JSON.stringify(entry)}\n`);
};

/**
 * @purpose Read ledger entries (optionally the last N).
 */
export const readLedger = (group = 'default', limit = 50): LedgerEntry[] => {
  try {
    const lines = readFileSync(ledgerPath(group), 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as LedgerEntry)
      .filter(Boolean);
  } catch {
    return [];
  }
};
