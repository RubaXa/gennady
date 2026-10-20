// @file: Peer domain ports — a runtime-agnostic transport contract for agent-to-agent messaging.
// @consumers: claude-code.transport, peer-invoker, peer.cmd
// @tasks: N/A

import type { PeerMessage } from './peer-message.ts';

/**
 * @purpose Identifier of the agent runtime a peer belongs to.
 * @consumer peer-port, adapters
 */
export type PeerRuntime = 'claude-code' | 'codex' | 'opencode' | (string & {});

/**
 * @purpose A normalized, addressable agent session independent of its runtime.
 * @consumer peer-invoker, peer.cmd
 */
export type PeerTarget = {
  /** @purpose Runtime that owns the session. */
  runtime: PeerRuntime;
  /** @purpose Stable id within the runtime (session id / thread id). */
  id: string;
  /** @purpose Human-readable name, if the runtime exposes one. */
  name?: string;
  /** @purpose Runtime-specific reply address (e.g. `uds:/tmp/cc-socks/123.sock`). */
  address: string;
  /** @purpose Working directory, when known. */
  cwd?: string;
  /** @purpose Owning process id, when known. */
  pid?: number;
  /** @purpose Current status advertised by the runtime, when known. */
  status?: string;
  /** @purpose Original runtime record for adapter-specific use. */
  raw?: unknown;
};

/**
 * @purpose How the peer must answer us: which tool, which address, which format.
 * @consumer peer-message, peer-invoker
 */
export type ReplyContract = {
  /** @purpose Tool/verb the subordinate should invoke (e.g. `SendMessage`). */
  tool: string;
  /** @purpose Our address the subordinate must target. */
  address: string;
  /** @purpose Wire format expected in the reply message. */
  format: 'peer-xml';
  /** @purpose Plain-language instructions embedded into the handshake. */
  instructions: string;
};

/**
 * @purpose Our identity and reply channel offered to a subordinate.
 * @consumer peer-invoker, adapters
 */
export type PeerSelf = {
  /** @purpose Display name of the leader. */
  name: string;
  /** @purpose Role we claim. */
  role: 'leader' | 'subordinate';
  /** @purpose Runtime we run on. */
  runtime: PeerRuntime;
  /** @purpose Our reply address. */
  address: string;
};

/**
 * @purpose Optional limits attached to a handshake.
 * @consumer peer-message
 */
export type PeerLimits = {
  /** @purpose Comma-separated actions the subordinate must not perform. */
  forbidden?: string;
  /** @purpose Actions that require an explicit leader approval. */
  approve?: string;
  /** @purpose Time/budget envelope. */
  budget?: string;
};

/**
 * @purpose A live inbound channel through which a runtime delivers peer messages to us.
 * @consumer peer-invoker
 */
export type PeerInbox = {
  /** @purpose Address to advertise as the reply target. */
  address: string;
  /**
   * @purpose Register a handler invoked for each inbound message.
   * @param handler Callback receiving every delivered message.
  
   */
  onMessage: (handler: (message: InboundMessage) => void) => void;
  /**
   * @purpose Tear the inbox down and release its resources.
   * @returns Resolves once the inbox is closed.
   */
  stop: () => Promise<void>;
};

/**
 * @purpose A message delivered to our inbox by a peer runtime.
 * @consumer peer-invoker
 */
export type InboundMessage = {
  /** @purpose Sender address. */
  from?: string;
  /** @purpose Sender display name. */
  fromName?: string;
  /** @purpose Whether the sender authenticated to our inbox. */
  authenticated: boolean;
  /** @purpose Raw payload as received. */
  raw: string;
  /** @purpose Unwrapped message body (peer XML or plain text). */
  body: string;
  /** @purpose Message id, when the runtime exposes one. */
  msgId?: string;
};

/**
 * @purpose Receipt of an accepted send.
 * @consumer peer-invoker
 */
export type SendReceipt = {
  /** @purpose Assigned message id. */
  msgId: string;
  /** @purpose Destination address. */
  address: string;
};

/**
 * @purpose Opaque marker used to locate a reply produced after a send.
 * @consumer peer-invoker, adapters
 */
export type ReplyMarker = {
  /** @purpose Adapter-specific position token (e.g. transcript line count). */
  position: number;
};

/**
 * @purpose Options for binding an inbox.
 * @consumer peer-invoker
 */
export type BindInboxOptions = {
  /** @purpose Display name for our synthetic session, when the runtime needs one. */
  name?: string;
};

/**
 * @purpose A runtime adapter: discover/resolve peers, send, receive, and explain replies.
 * @consumer peer-invoker, peer.cmd
 */
export interface PeerTransport {
  /** @purpose Runtime this adapter speaks for. */
  readonly runtime: PeerRuntime;
  /** @purpose Whether to prepend the peer handshake (false for plain-text runtimes). */
  readonly usesHandshake?: boolean;
  /**
   * @purpose List addressable peers of this runtime.
   * @returns Addressable peer targets.
   */
  discover(): Promise<PeerTarget[]>;
  /**
   * @purpose Resolve one peer by name/id/address.
   * @param query Name, id, address, pid or job id.
   * @returns The peer target, or undefined when none matches.
   */
  resolve(query: string): Promise<PeerTarget | undefined>;
  /**
   * @purpose Start an inbox so peers can deliver messages back to us.
   * @param [options] Optional inbox configuration.
   * @returns A live inbox with its reply address.
   */
  bindInbox?(options?: BindInboxOptions): Promise<PeerInbox>;
  /**
   * @purpose Send a message to a peer.
   * @param target Destination peer.
   * @param message Message to deliver.
   * @param self Our identity and reply address.
   * @returns Send receipt with the assigned message id.
   */
  send?(target: PeerTarget, message: PeerMessage, self: PeerSelf): Promise<SendReceipt>;
  /**
   * @purpose Synchronous request/response call for runtimes without an inbox (e.g. CLI exec).
   * @param target Destination peer.
   * @param message Message to deliver.
   * @returns The reply text produced by the peer.
   */
  call?(target: PeerTarget, message: PeerMessage): Promise<string>;
  /**
   * @purpose Build the adapter-specific reply contract telling the peer which tool to use.
   * @param self Our identity and reply address.
   * @returns Reply contract for this runtime.
   */
  replyContract(self: PeerSelf): ReplyContract;
  /**
   * @purpose Snapshot a position so a later reply can be located (transcript-based runtimes).
   * @param target Peer whose reply position is marked.
   * @returns Opaque reply marker.
   */
  markReplyPosition?(target: PeerTarget): Promise<ReplyMarker>;
  /**
   * @purpose Read a reply produced since a marker, or null when none/unavailable.
   * @param target Peer whose reply is read.
   * @param marker Marker previously returned by {@link PeerTransport.markReplyPosition}.
   * @returns Reply text, or null when nothing new.
   */
  readReply?(target: PeerTarget, marker: ReplyMarker): Promise<string | null>;
  /**
   * @purpose Report whether the peer has finished its current turn.
   * @param target Peer to check.
   * @returns True when idle, false when still working, undefined when unknown.
   */
  isIdle?(target: PeerTarget): Promise<boolean | undefined>;
  /**
   * @purpose Read a human-readable digest of the peer's recent activity.
   * @param target Peer to inspect.
   * @returns Recent activity summary, or null when unavailable.
   */
  readActivity?(target: PeerTarget): Promise<string | null>;
}
