// @file: Codex peer transport — read threads; send via `codex queue`, reply by polling thread items.
// @consumers: peer-transport-registry
// @tasks: N/A

import {
  listAgentTexts,
  listCodexThreads,
  queueCodexMessage,
  readCodexActivity,
  type CodexThread,
} from './codex-store.ts';
import { bestFuzzyMatch } from '../peer-match.ts';
import type {
  BindInboxOptions,
  PeerInbox,
  PeerSelf,
  PeerTarget,
  PeerTransport,
  ReplyContract,
  ReplyMarker,
  SendReceipt,
} from '../peer-port.ts';
import type { PeerMessage } from '../peer-message.ts';

/**
 * @purpose Convert a Codex thread into a normalized peer target.
 * @param thread Thread row.
 * @returns Peer target.
 */
const toTarget = (thread: CodexThread): PeerTarget => ({
  runtime: 'codex',
  id: thread.id,
  name: thread.title ?? thread.id.slice(0, 8),
  address: `codex:${thread.id}`,
  cwd: thread.cwd,
  status: thread.archived ? 'archived' : (thread.model ?? undefined),
  raw: thread,
});

/**
 * @purpose Codex implementation of {@link PeerTransport}.
 * @consumer peer-transport-registry
 */
export class CodexTransport implements PeerTransport {
  /** @purpose Runtime discriminator. */
  readonly runtime = 'codex' as const;

  /** @purpose Codex accepts plain text, not the peer XML handshake. */
  readonly usesHandshake = false;

  /**
   * @purpose List Codex threads.
   * @returns Addressable peer targets.
   */
  async discover(): Promise<PeerTarget[]> {
    return listCodexThreads().map(toTarget);
  }

  /**
   * @purpose Resolve a thread by title or id (exact, prefix, then fuzzy).
   * @param query Title or id.
   * @returns The peer target, or undefined.
   */
  async resolve(query: string): Promise<PeerTarget | undefined> {
    const q = query.trim().toLowerCase();
    const threads = listCodexThreads();
    const exact = threads.find(
      (t) => t.title?.toLowerCase() === q || t.id === query || t.id === `codex:${query}`
    );
    if (exact) return toTarget(exact);
    const prefix = threads.find(
      (t) => t.title?.toLowerCase().startsWith(q) || t.id.startsWith(query)
    );
    if (prefix) return toTarget(prefix);
    const fuzzy = bestFuzzyMatch(
      threads.map((t) => ({ id: t.id, title: t.title, thread: t })),
      query
    );
    return fuzzy ? toTarget(fuzzy.thread) : undefined;
  }

  /**
   * @purpose Codex has no inbox; replies are read from the thread store.
   * @param [options] Ignored.
   * @returns A no-op inbox whose address is the Codex thread address.
   */
  async bindInbox(options: BindInboxOptions = {}): Promise<PeerInbox> {
    void options;
    return { address: 'codex:noop', onMessage: () => {}, stop: async () => {} };
  }

  /**
   * @purpose Queue a message for the thread via the app-server daemon.
   * @param target Destination thread.
   * @param message Message to deliver.
   * @returns Send receipt.
   */
  async send(target: PeerTarget, message: PeerMessage): Promise<SendReceipt> {
    await queueCodexMessage(target.id, message.body, message.model);
    return { msgId: '', address: target.address };
  }

  /**
   * @purpose Codex has no tool-based reply contract.
   * @param self Our identity.
   * @returns A placeholder reply contract.
   */
  replyContract(self: PeerSelf): ReplyContract {
    return {
      tool: '(codex queue)',
      address: self.address,
      format: 'peer-xml',
      instructions: 'Messages are queued; the reply appears as the thread’s next agent message.',
    };
  }

  /**
   * @purpose Marker = number of agent messages already present.
   * @param target Thread to mark.
   * @returns Reply marker.
   */
  async markReplyPosition(target: PeerTarget): Promise<ReplyMarker> {
    return { position: listAgentTexts(target.id).length };
  }

  /**
   * @purpose Read agent messages produced after the marker.
   * @param target Thread to read.
   * @param marker Marker from {@link CodexTransport.markReplyPosition}.
   * @returns Joined new agent text, or null when nothing new.
   */
  async readReply(target: PeerTarget, marker: ReplyMarker): Promise<string | null> {
    const texts = listAgentTexts(target.id);
    if (texts.length <= marker.position) return null;
    return texts.slice(marker.position).join('\n\n---\n\n');
  }

  /**
   * @purpose Read a digest of the thread's activity.
   * @param target Thread to inspect.
   * @returns Activity digest, or null when none.
   */
  async readActivity(target: PeerTarget): Promise<string | null> {
    return readCodexActivity(target.id);
  }
}
