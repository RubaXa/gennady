// @file: Peer invoker — runtime-agnostic send/ask that threads a handshake with the reply contract.
// @spec: PEER
// @consumers: peer.cmd

import { getTransport, defaultTransport } from './peer-transport-registry.ts';
import { buildHandshake, buildRequest, buildTask, type HandshakeSpec } from './peer-message.ts';
import { appendLedger } from './peer-ledger.ts';
import type { PeerLimits, PeerSelf, PeerTarget, PeerTransport } from './peer-port.ts';

/**
 * @purpose How an invocation waits for the reply.
 * @consumer peer.cmd
 */
export type ReplyMode = 'auto' | 'transcript' | 'message';

/**
 * @purpose Task specification handed to a subordinate.
 * @consumer peer-invoker, peer.cmd
 */
export type TaskSpec = {
  /** @purpose Task id used for correlation. */
  id: string;
  /** @purpose What the subordinate must achieve. */
  goal: string;
  /** @purpose Acceptance criteria. */
  acceptance?: string;
  /** @purpose Actions the subordinate must not perform. */
  forbidden?: string;
  /** @purpose Report cadence hint. */
  cadence?: string;
};

/**
 * @purpose Options for {@link invokePeer}.
 * @consumer peer.cmd
 */
export type InvokeParams = {
  /** @purpose Target peer. */
  target: PeerTarget;
  /** @purpose Task to assign. */
  task: TaskSpec;
  /** @purpose Our display name. */
  selfName?: string;
  /** @purpose Ledger group to record into. */
  group?: string;
  /** @purpose Send the handshake preamble before the task (default true). */
  includeHandshake?: boolean;
  /** @purpose Optional limits embedded in the handshake. */
  limits?: PeerLimits;
  /** @purpose Optional model override (`provider/model`), runtime-permitting. */
  model?: string;
  /** @purpose Reply source strategy. Defaults to `auto`. */
  mode?: ReplyMode;
  /** @purpose Overall timeout in ms. */
  timeoutMs?: number;
  /** @purpose Poll interval in ms. */
  pollMs?: number;
};

/**
 * @purpose Outcome of {@link invokePeer}.
 * @consumer peer.cmd
 */
export type InvokeResult = {
  /** @purpose Which channel delivered the reply. */
  source: 'transcript' | 'message' | 'call';
  /** @purpose Reply text. */
  reply: string;
  /** @purpose Sent message id. */
  msgId: string;
  /** @purpose Handshake block sent (for audit). */
  handshake: string;
  /** @purpose Task block sent (for audit). */
  task: string;
};

/**
 * @purpose Render a task as plain text for runtimes without the peer XML vocabulary.
 */
export const renderTaskText = (task: TaskSpec): string =>
  [
    task.goal,
    task.acceptance ? `Acceptance: ${task.acceptance}` : '',
    task.forbidden ? `Forbidden: ${task.forbidden}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * @purpose Build the handshake + task payload for a target using its adapter's reply contract.
 */
export const buildInvocationPayload = (
  transport: PeerTransport,
  self: PeerSelf,
  task: TaskSpec,
  options: { limits?: PeerLimits; reportSections?: string[] } = {}
): { handshake: string; task: string } => {
  const reply = transport.replyContract(self);
  const spec: HandshakeSpec = {
    self,
    reply,
    limits: options.limits,
    reportSections: options.reportSections,
  };
  return { handshake: buildHandshake(spec), task: buildTask(task) };
};

/**
 * @purpose Start an inbox, send a task (with handshake), and wait for the FINAL reply.
 * @throws Error on timeout or when the runtime cannot receive.
 */
export const invokePeer = async (params: InvokeParams): Promise<InvokeResult> => {
  const transport = getTransport(params.target.runtime) ?? defaultTransport();
  const group = params.group ?? 'default';

  if (transport.call) {
    const self: PeerSelf = {
      name: params.selfName ?? 'gennady',
      role: 'leader',
      runtime: 'gennady',
      address: '(synchronous)',
    };
    const task = buildRequest(self, params.task, self.address);
    appendLedger(
      {
        ts: Date.now(),
        dir: 'out',
        runtime: transport.runtime,
        target: params.target.name ?? params.target.id,
        kind: 'task',
        text: task,
      },
      group
    );
    const reply = await transport.call(params.target, {
      kind: 'task',
      body: task,
      taskId: params.task.id,
      model: params.model,
    });
    appendLedger(
      {
        ts: Date.now(),
        dir: 'in',
        runtime: transport.runtime,
        target: params.target.name ?? params.target.id,
        kind: 'reply',
        source: 'call',
        text: reply,
      },
      group
    );
    return { source: 'call', reply, msgId: '', handshake: '', task };
  }

  if (!transport.bindInbox || !transport.send) {
    throw new Error(`Runtime "${transport.runtime}" cannot receive a reply`);
  }

  const mode: ReplyMode = params.mode ?? 'auto';
  const timeoutMs = params.timeoutMs ?? 300_000;
  const pollMs = params.pollMs ?? 1000;

  const inbox = await transport.bindInbox({ name: 'gennady' });
  const self: PeerSelf = {
    name: params.selfName ?? 'gennady',
    role: 'leader',
    runtime: 'gennady',
    address: inbox.address,
  };
  const { handshake, task } = buildInvocationPayload(transport, self, params.task, {
    limits: params.limits,
  });
  const body =
    params.includeHandshake === false || transport.usesHandshake === false
      ? buildRequest(self, params.task, self.address)
      : `${handshake}\n${task}`;

  let settled = false;
  let resolveReply: (value: InvokeResult) => void = () => {};
  let rejectReply: (reason: Error) => void = () => {};
  const replyPromise = new Promise<InvokeResult>((resolve, reject) => {
    resolveReply = resolve;
    rejectReply = reject;
  });
  const finish = (value: InvokeResult): void => {
    if (settled) return;
    settled = true;
    appendLedger(
      {
        ts: Date.now(),
        dir: 'in',
        runtime: transport.runtime,
        target: params.target.name ?? params.target.id,
        kind: 'reply',
        source: value.source,
        text: value.reply,
      },
      group
    );
    resolveReply(value);
  };

  let timer: NodeJS.Timeout | undefined;
  let poller: NodeJS.Timeout | undefined;
  try {
    const marker = transport.markReplyPosition
      ? await transport.markReplyPosition(params.target)
      : undefined;

    if (mode === 'auto' || mode === 'message') {
      inbox.onMessage((message) => {
        if (message.body) {
          finish({ source: 'message', reply: message.body, msgId: '', handshake, task });
        }
      });
    }

    const receipt = await transport.send(
      params.target,
      { kind: 'task', body, taskId: params.task.id, model: params.model },
      self
    );
    appendLedger(
      {
        ts: Date.now(),
        dir: 'out',
        runtime: transport.runtime,
        target: params.target.name ?? params.target.id,
        kind: 'task',
        text: body,
      },
      group
    );

    if (transport.readReply && marker && (mode === 'auto' || mode === 'transcript')) {
      let lastReply: string | null = null;
      let stable = 0;
      poller = setInterval(() => {
        void (async () => {
          const reply = await transport.readReply?.(params.target, marker);
          if (!reply) return;
          if (reply === lastReply) stable++;
          else {
            lastReply = reply;
            stable = 0;
          }
          const idle = transport.isIdle ? await transport.isIdle(params.target) : true;
          if (idle !== false && stable >= 1) {
            if (poller) clearInterval(poller);
            poller = undefined;
            finish({
              source: 'transcript',
              reply,
              msgId: receipt.msgId,
              handshake,
              task,
            });
          }
        })();
      }, pollMs);
      // Keep standalone ask alive until the reply; finally clears this poller.
    }

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      rejectReply(
        new Error(`No reply from "${params.target.name ?? params.target.id}" within ${timeoutMs}ms`)
      );
    }, timeoutMs);
    // Keep the bounded timeout alive when the transport has no referenced inbox handle.

    return await replyPromise;
  } finally {
    if (timer) clearTimeout(timer);
    if (poller) clearInterval(poller);
    await inbox.stop();
  }
};

/**
 * @purpose Send a one-way task/handshake without waiting for a reply.
 */
export const sendPeer = async (params: {
  target: PeerTarget;
  task: TaskSpec;
  selfName?: string;
  group?: string;
  includeHandshake?: boolean;
  limits?: PeerLimits;
  model?: string;
}): Promise<{ msgId: string }> => {
  const transport = getTransport(params.target.runtime) ?? defaultTransport();
  const group = params.group ?? 'default';
  const logOut = (text: string): void =>
    appendLedger(
      {
        ts: Date.now(),
        dir: 'out',
        runtime: transport.runtime,
        target: params.target.name ?? params.target.id,
        kind: 'task',
        text,
      },
      group
    );

  if (transport.call) {
    const callSelf: PeerSelf = {
      name: params.selfName ?? 'gennady',
      role: 'leader',
      runtime: 'gennady',
      address: '(synchronous)',
    };
    const task = buildRequest(callSelf, params.task, callSelf.address);
    logOut(task);
    await transport.call(params.target, {
      kind: 'task',
      body: task,
      taskId: params.task.id,
      model: params.model,
    });
    return { msgId: '' };
  }

  if (!transport.bindInbox || !transport.send) {
    throw new Error(`Runtime "${transport.runtime}" cannot send`);
  }

  const inbox = await transport.bindInbox({ name: 'gennady' });
  const self: PeerSelf = {
    name: params.selfName ?? 'gennady',
    role: 'leader',
    runtime: 'gennady',
    address: inbox.address,
  };
  try {
    const { handshake, task } = buildInvocationPayload(transport, self, params.task, {
      limits: params.limits,
    });
    const body =
      params.includeHandshake === false || transport.usesHandshake === false
        ? buildRequest(self, params.task, self.address)
        : `${handshake}\n${task}`;
    logOut(body);
    const receipt = await transport.send(
      params.target,
      { kind: 'task', body, taskId: params.task.id, model: params.model },
      self
    );
    return { msgId: receipt.msgId };
  } finally {
    await inbox.stop();
  }
};
