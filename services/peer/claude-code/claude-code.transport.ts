// @file: Claude Code peer transport adapter — discover/resolve sessions, UDS inbox, SendMessage reply contract.
// @consumers: peer-transport-registry, peer.cmd
// @tasks: N/A

import {
  listLiveSessions,
  resolveSession,
  sessionStatus,
  transcriptPath,
  type ClaudeSession,
} from './claude-sessions.ts';
import { startClaudeInbox } from './claude-inbox.ts';
import { countTranscriptLines, readAssistantTurnsSince } from './claude-transcript.ts';
import { sendToClaudeSession } from './claude-send.ts';
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
 * @purpose Convert a Claude session record into a normalized peer target.
 * @param session Claude session record.
 * @returns Peer target.
 */
const toTarget = (session: ClaudeSession): PeerTarget => ({
  runtime: 'claude-code',
  id: session.sessionId,
  name: session.name,
  address: session.messagingSocketPath ? `uds:${session.messagingSocketPath}` : '',
  cwd: session.cwd,
  pid: session.pid,
  status: session.status,
  raw: session,
});

/**
 * @purpose Instructions telling a Claude Code session which tool to use to answer us.
 * @param self Our identity and reply address.
 * @returns Reply contract.
 */
const buildClaudeReplyContract = (self: PeerSelf): ReplyContract => ({
  tool: 'SendMessage',
  address: self.address,
  format: 'peer-xml',
  instructions:
    `To answer me, call the SendMessage tool with to="${self.address}" and message set to your ` +
    `reply (a <peer-report ...>...</peer-report> block). This address is the same value carried in ` +
    `the from= attribute of my message to you — it is my inbox, the standard reply channel between ` +
    `sessions. Do not answer your user on my behalf; report to me.`,
});

/**
 * @purpose Claude Code implementation of {@link PeerTransport}.
 * @consumer peer-transport-registry
 */
export class ClaudeCodeTransport implements PeerTransport {
  /** @purpose Runtime discriminator. */
  readonly runtime = 'claude-code' as const;

  /**
   * @purpose List live Claude Code sessions with an inbox.
   * @returns Addressable peer targets.
   */
  async discover(): Promise<PeerTarget[]> {
    return listLiveSessions()
      .filter((session) => session.messagingSocketPath)
      .map(toTarget);
  }

  /**
   * @purpose Resolve a live session by name/id/pid/job.
   * @param query Name, sessionId, pid or job id.
   * @returns The peer target, or undefined when none matches.
   */
  async resolve(query: string): Promise<PeerTarget | undefined> {
    const session = resolveSession(query);
    return session ? toTarget(session) : undefined;
  }

  /**
   * @purpose Bind our synthetic inbox so the peer can reply to us.
   * @param [options] Optional inbox configuration.
   * @returns A live inbox with its uds reply address.
   */
  async bindInbox(options: BindInboxOptions = {}): Promise<PeerInbox> {
    const inbox = await startClaudeInbox({ name: options.name });
    return {
      address: inbox.address,
      onMessage: inbox.onMessage,
      stop: inbox.stop,
    };
  }

  /**
   * @purpose Send a message to a Claude Code session.
   * @param target Destination peer.
   * @param message Message to deliver.
   * @param self Our identity and reply address.
   * @returns Send receipt with the assigned message id.
   */
  async send(target: PeerTarget, message: PeerMessage, self: PeerSelf): Promise<SendReceipt> {
    if (!target.raw) throw new Error(`Target "${target.name ?? target.id}" has no session record`);
    const result = await sendToClaudeSession({
      session: target.raw as ClaudeSession,
      body: message.body,
      from: self.address,
      fromName: self.name,
      fromMode: 'prompting',
    });
    return { msgId: result.msgId, address: target.address };
  }

  /**
   * @purpose Explain to the peer how to reply via SendMessage.
   * @param self Our identity and reply address.
   * @returns Reply contract naming the SendMessage tool and our address.
   */
  replyContract(self: PeerSelf): ReplyContract {
    return buildClaudeReplyContract(self);
  }

  /**
   * @purpose Snapshot the transcript line count before sending.
   * @param target Peer whose transcript position is marked.
   * @returns Reply marker holding the current line count.
   */
  async markReplyPosition(target: PeerTarget): Promise<ReplyMarker> {
    const session = target.raw as ClaudeSession;
    return { position: countTranscriptLines(transcriptPath(session)) };
  }

  /**
   * @purpose Read assistant text produced after the marker, or null when none.
   * @param target Peer whose transcript is read.
   * @param marker Marker from {@link ClaudeCodeTransport.markReplyPosition}.
   * @returns Joined assistant text, or null when nothing new.
   */
  async readReply(target: PeerTarget, marker: ReplyMarker): Promise<string | null> {
    const session = target.raw as ClaudeSession;
    const turns = readAssistantTurnsSince(transcriptPath(session), marker.position);
    if (turns.length === 0) return null;
    return turns.map((turn) => turn.text).join('\n\n');
  }

  /**
   * @purpose Report whether the session is finished with its current turn.
   * @param target Session to check.
   * @returns True when the session record status is `idle`.
   */
  async isIdle(target: PeerTarget): Promise<boolean | undefined> {
    const status = sessionStatus(target.pid ?? Number.NaN);
    if (status === undefined) return undefined;
    return status === 'idle';
  }

  /**
   * @purpose Read a digest of the session's recent assistant activity.
   * @param target Session to inspect.
   * @returns Recent assistant text, or null when none.
   */
  async readActivity(target: PeerTarget): Promise<string | null> {
    const session = target.raw as ClaudeSession;
    const turns = readAssistantTurnsSince(transcriptPath(session), 0);
    if (turns.length === 0) return null;
    return turns
      .slice(-3)
      .map((turn) => turn.text)
      .join('\n\n---\n\n');
  }
}
