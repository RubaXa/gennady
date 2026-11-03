// @file: Bounded CLI invocation evidence for bare commands and one literal exit-reporting echo suffix.
// @spec: AI-SKILLS
// @consumers: brownfield proposal measurement and offline replay; never a shell interpreter

export type BrownfieldCommandEvent = {
  i: number;
  tool: string;
  command?: string;
  arg?: string;
  status?: string;
  exitCode?: number;
  sessionId?: string;
  messageId?: string;
  callId?: string;
  startedAt?: number;
  finishedAt?: number;
};
export type BrownfieldCommandCapture = {
  complete: boolean;
  messages: readonly unknown[];
};
export const BROWNFIELD_COMMAND_PROOF_REVISION = 'bounded-exit-echo-v2';
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** @purpose Recover the CLI exit only from one complete, identity-bound SDK result, never from agent narration or an unbound marker. */
function capturedExit(
  event: BrownfieldCommandEvent,
  capture: BrownfieldCommandCapture | undefined
): number | undefined {
  if (
    !capture?.complete ||
    !event.sessionId ||
    !event.messageId ||
    !event.callId ||
    !Number.isSafeInteger(event.startedAt) ||
    !Number.isSafeInteger(event.finishedAt) ||
    event.finishedAt! < event.startedAt!
  )
    return;
  const matches: Array<{ message: Record<string, unknown>; part: Record<string, unknown> }> = [];
  for (const raw of capture.messages) {
    const message = object(raw),
      info = object(message?.info);
    if (!info || info.sessionID !== event.sessionId || !Array.isArray(message?.parts)) continue;
    for (const rawPart of message.parts) {
      const part = object(rawPart);
      // Preserve duplicate call identity detection even if a duplicate has a wrong type/role.
      if (part?.callID === event.callId) matches.push({ message, part });
    }
  }
  if (matches.length !== 1) return;
  const { message, part } = matches[0]!;
  const info = object(message.info)!,
    state = object(part.state);
  const input = object(state?.input),
    metadata = object(state?.metadata),
    time = object(state?.time);
  if (
    info.role !== 'assistant' ||
    typeof info.id !== 'string' ||
    event.messageId !== `${event.sessionId}:${info.id}` ||
    part.messageID !== info.id ||
    part.sessionID !== event.sessionId ||
    part.type !== 'tool' ||
    part.tool !== 'bash' ||
    state?.status !== 'completed' ||
    input?.command !== event.command ||
    metadata?.exit !== 0 ||
    event.exitCode !== 0 ||
    metadata?.truncated !== false ||
    time?.start !== event.startedAt ||
    time?.end !== event.finishedAt ||
    typeof state.output !== 'string' ||
    metadata.output !== state.output ||
    Buffer.byteLength(state.output) > 65536
  )
    return;
  const output = state.output;
  // Do not interpret terminal rewrites, control escapes, repeated or ambiguous exit markers.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\r(?!\n)/u.test(output)) return;
  if ((output.match(/EXIT:/g) ?? []).length !== 1) return;
  const marker = /(?:^|\n)EXIT:(0|[1-9][0-9]{0,2})(?:\r?\n)+$/u.exec(output);
  if (!marker || Number(marker[1]) > 255) return;
  return Number(marker[1]);
}

/** @purpose Parse only a bounded installed CLI spelling; one optional echo suffix uses captured CLI exit rather than the shell's successful echo exit. */
export function brownfieldCommandInvocation(
  event: BrownfieldCommandEvent,
  capture?: BrownfieldCommandCapture
): { words: string[]; exitCode: number; wrapped: boolean } | undefined {
  const command = event.command;
  if (
    !Number.isSafeInteger(event.i) ||
    event.i < 0 ||
    event.tool !== 'bash' ||
    event.status !== 'completed' ||
    !command ||
    /[\r\n]/.test(command)
  )
    return;
  const suffix = /;[ \t]*echo[ \t]+(?:"EXIT:\$\?"|EXIT:\$\?)[ \t]*$/u.exec(command);
  const wrapped = !!suffix;
  const base = wrapped ? command.slice(0, suffix!.index) : command;
  // ASCII tokens only: shell whitespace and JS Unicode whitespace must never disagree.
  if (!/^[A-Za-z0-9_./= \t-]+$/u.test(base)) return;
  const words = base.trim().split(/[ \t]+/);
  let executable = words.shift();
  if (executable === 'npx') {
    while (['--no-install', '--offline'].includes(words[0] ?? '')) words.shift();
    executable = words.shift();
  }
  if (
    !['gennady', './node_modules/.bin/gennady', 'node_modules/.bin/gennady'].includes(
      executable ?? ''
    )
  )
    return;
  const exitCode = wrapped ? capturedExit(event, capture) : event.exitCode;
  if (!Number.isSafeInteger(exitCode) || exitCode! < 0 || exitCode! > 255) return;
  return { words, exitCode: exitCode!, wrapped };
}
