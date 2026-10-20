#!/usr/bin/env node
// @file: CLI command peer — qualified cross-app agent messaging (Claude/OpenCode/Codex).
// @spec: PEER
// @consumers: gennady.ts

import { randomUUID } from 'node:crypto';
import { style } from '../../../shared/common/style.ts';
import {
  resolveRef,
  listTransports,
  getTransport,
} from '../../../services/peer/peer-transport-registry.ts';
import { formatRef } from '../../../services/peer/peer-ref.ts';
import { invokePeer, sendPeer, type ReplyMode } from '../../../services/peer/peer-invoker.ts';
import { forgetPeer, listPeers, putPeer } from '../../../services/peer/peer-store.ts';
import { readLedger } from '../../../services/peer/peer-ledger.ts';
import type { PeerTarget } from '../../../services/peer/peer-port.ts';
import { printHelp } from './help.ts';

type ParsedArgs = {
  positionals: string[];
  options: Record<string, string | true>;
};

/** @purpose Injectable dependencies for the peer command. */
export type PeerDeps = {
  /** @purpose Standard output stream — user-facing messages */
  stdout: NodeJS.WriteStream;
  /** @purpose Standard error stream — error messages */
  stderr: NodeJS.WriteStream;
  /**
   * @purpose Terminate the process with a given exit code — never returns.
   * @param code Exit code (0 = success, non-zero = failure).
   * @returns Never; function terminates the process.
   */
  exit: (code: number) => never;
};

/** @purpose Default DI — real process bindings. @returns Fresh deps wired to process. */
function defaultDeps(): PeerDeps {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    exit: (code: number) => process.exit(code),
  };
}

const parse = (argv: string[]): ParsedArgs => {
  const positionals: string[] = [];
  const options: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-')) {
      const clean = arg.replace(/^-+/, '');
      const [key, inline] = clean.split('=');
      if (inline !== undefined) options[key] = inline;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[key] = argv[i + 1];
        i++;
      } else options[key] = true;
    } else positionals.push(arg);
  }
  return { positionals, options };
};

const renderTarget = (target: PeerTarget, alias?: string): string => {
  const ref = style.bold(formatRef(target));
  const aliasTag = alias ? style.magenta(` (${alias})`) : '';
  const status = target.status ? ` ${style.gray(`[${target.status}]`)}` : '';
  return `  ${style.cyan(target.runtime)} ${ref}${aliasTag}${status}`;
};

const commandList = async (
  options: Record<string, string | true>,
  deps: PeerDeps
): Promise<void> => {
  const aliases = new Map(listPeers().map((peer) => [peer.sessionId, peer.name]));
  const bundles = await Promise.all(
    listTransports().map(async (transport) => ({
      runtime: transport.runtime,
      targets: await transport.discover(),
    }))
  );
  if (options.json) {
    deps.stdout.write(JSON.stringify(bundles, null, 2) + '\n');
    return;
  }
  for (const { runtime, targets } of bundles) {
    deps.stdout.write(`${style.blue(`# ${runtime} (${targets.length})`)}\n`);
    for (const target of targets.slice(0, 40))
      deps.stdout.write(`${renderTarget(target, aliases.get(target.id))}\n`);
  }
};

const commandInit = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const target = args.positionals[0];
  if (!target) {
    deps.stderr.write(
      `${style.red('Usage: gennady peer init <runtime:target> [--name alias] [--role ...]')}\n`
    );
    deps.exit(1);
  }
  const { target: resolved, ambiguous } = await resolveRef(target);
  if (!resolved) {
    deps.stderr.write(
      `${
        ambiguous
          ? style.red(
              `Неоднозначно: ${ambiguous.map((t) => formatRef(t)).join(', ')} — уточни runtime:`
            )
          : style.red(`Сессия "${target}" не найдена`)
      }\n`
    );
    deps.exit(1);
  }
  const name = (args.options.name as string | undefined) ?? target;
  const alias = putPeer({
    name,
    runtime: resolved.runtime,
    sessionId: resolved.id,
    role: (args.options.role as 'leader' | 'subordinate' | undefined) ?? 'subordinate',
    group: args.options.group as string | undefined,
    socketPath: resolved.address,
    cwd: resolved.cwd,
    addedAt: Date.now(),
  });
  deps.stdout.write(
    `${style.green(
      `✓ alias ${style.bold(alias.name)} → ${alias.runtime}:${alias.sessionId} [${alias.role}]`
    )}\n`
  );
};

const commandForget = (args: ParsedArgs, deps: PeerDeps): void => {
  const name = args.positionals[0];
  if (!name) {
    deps.stderr.write(`${style.red('Usage: gennady peer forget <alias>')}\n`);
    deps.exit(1);
  }
  const removed = forgetPeer(name);
  deps.stdout.write(
    `${removed ? style.green(`✓ alias ${name} удалён`) : style.yellow(`alias ${name} не найден`)}\n`
  );
};

const resolveTargetOrExit = async (query: string, deps: PeerDeps): Promise<PeerTarget> => {
  const { target, ambiguous } = await resolveRef(query);
  if (ambiguous) {
    deps.stderr.write(
      `${style.red(
        `Неоднозначно "${query}": ${ambiguous.map((t) => style.bold(formatRef(t))).join(', ')}\nУточни runtime, напр. ${style.bold(formatRef(ambiguous[0]))}`
      )}\n`
    );
    deps.exit(1);
  }
  if (!target) {
    deps.stderr.write(
      `${style.red(`Не нашёл "${query}". Используй runtime:name. Список: gennady peer list`)}\n`
    );
    deps.exit(1);
  }
  return target;
};

const commandRead = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const query = args.positionals.join(' ');
  if (!query) {
    deps.stderr.write(`${style.red('Usage: gennady peer read <runtime:target>')}\n`);
    deps.exit(1);
  }
  const target = await resolveTargetOrExit(query, deps);
  const transport = getTransport(target.runtime);
  if (!transport?.readActivity) {
    deps.stderr.write(`${style.red(`Чтение не поддерживается для "${target.runtime}"`)}\n`);
    deps.exit(1);
  }
  const activity = await transport.readActivity(target);
  deps.stdout.write(
    `${style.blue(`# ${formatRef(target)}${target.cwd ? ` · ${target.cwd}` : ''}`)}\n`
  );
  deps.stdout.write(`${activity ?? style.gray('(нет данных о активности)')}\n`);
};

const commandLedger = (args: ParsedArgs, deps: PeerDeps): void => {
  const group = (args.options.group as string | undefined) ?? 'default';
  const limit = args.options.limit ? Number(args.options.limit) : 20;
  const entries = readLedger(group, limit);
  if (entries.length === 0) {
    deps.stdout.write(`${style.gray(`(ledger "${group}" пуст)`)}\n`);
    return;
  }
  deps.stdout.write(`${style.blue(`# ledger ${group} (${entries.length})`)}\n`);
  for (const entry of entries) {
    const ts = new Date(entry.ts).toISOString().slice(11, 19);
    const dir = entry.dir === 'out' ? style.yellow('→') : style.green('←');
    deps.stdout.write(
      `${dir} ${style.gray(ts)} ${entry.runtime}/${entry.target}${entry.source ? ` [${entry.source}]` : ''}\n  ${entry.text.replace(/\s+/g, ' ').slice(0, 200)}\n`
    );
  }
};

const commandSend = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const [targetQuery, ...messageParts] = args.positionals;
  if (!targetQuery || messageParts.length === 0) {
    deps.stderr.write(`${style.red('Usage: gennady peer send <runtime:target> <message...>')}\n`);
    deps.exit(1);
  }
  const target = await resolveTargetOrExit(targetQuery, deps);
  const { msgId } = await sendPeer({
    target,
    task: { id: randomUUID().slice(0, 8), goal: messageParts.join(' ') },
    group: args.options.group as string | undefined,
    model: args.options.model as string | undefined,
  });
  deps.stdout.write(`${style.green(`✓ sent${msgId ? ` ${msgId}` : ''} → ${formatRef(target)}`)}\n`);
};

const commandAsk = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const [targetQuery, ...messageParts] = args.positionals;
  if (!targetQuery || messageParts.length === 0) {
    deps.stderr.write(
      `${style.red('Usage: gennady peer ask <runtime:target> <message...> [--timeout ms]')}\n`
    );
    deps.exit(1);
  }
  const target = await resolveTargetOrExit(targetQuery, deps);
  const timeoutMs = args.options.timeout ? Number(args.options.timeout) : undefined;
  const mode = (args.options.mode as ReplyMode | undefined) ?? 'auto';
  deps.stdout.write(`${style.gray(`→ ${formatRef(target)} ...`)}\n`);
  const result = await invokePeer({
    target,
    task: { id: randomUUID().slice(0, 8), goal: messageParts.join(' ') },
    includeHandshake: args.options['no-handshake'] !== true,
    mode,
    timeoutMs,
    group: args.options.group as string | undefined,
    model: args.options.model as string | undefined,
  });
  deps.stdout.write(`${style.blue(`◀ reply [${result.source}]`)}\n`);
  deps.stdout.write(`${result.reply}\n`);
};

const commandFanout = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const [group, ...messageParts] = args.positionals;
  if (!group || messageParts.length === 0) {
    deps.stderr.write(
      `${style.red('Usage: gennady peer fanout <group> <message...> [--timeout ms]')}\n`
    );
    deps.exit(1);
  }
  const members = listPeers().filter((peer) => peer.group === group);
  if (members.length === 0) {
    deps.stderr.write(`${style.yellow(`Группа "${group}" пуста (peer init --group ${group})`)}\n`);
    deps.exit(1);
  }
  const timeoutMs = args.options.timeout ? Number(args.options.timeout) : undefined;
  const task = messageParts.join(' ');
  deps.stdout.write(`${style.blue(`# fanout group="${group}" → ${members.length} агент(ов)`)}\n`);
  for (const member of members) {
    const ref =
      member.runtime && member.sessionId
        ? `${member.runtime}:${member.sessionId}`
        : (member.sessionId ?? member.name);
    deps.stdout.write(`${style.gray(`\n→ ${member.name} (${ref})`)}\n`);
    try {
      const target = await resolveTargetOrExit(ref, deps);
      const result = await invokePeer({
        target,
        task: { id: randomUUID().slice(0, 8), goal: task },
        timeoutMs,
        group,
      });
      deps.stdout.write(`${style.blue(`◀ [${result.source}]`)}\n`);
      deps.stdout.write(`${result.reply}\n`);
    } catch (error) {
      deps.stderr.write(`${style.red(`✗ ${member.name}: ${(error as Error).message}`)}\n`);
    }
  }
};

const commandWatch = async (args: ParsedArgs, deps: PeerDeps): Promise<void> => {
  const group = (args.options.group as string | undefined) ?? 'default';
  const seconds = args.options.seconds ? Number(args.options.seconds) : 60;
  deps.stdout.write(`${style.gray(`watching ledger "${group}" for ${seconds}s ...`)}\n`);
  let seen = readLedger(group, 1_000_000).length;
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const entries = readLedger(group, 1_000_000);
    for (const entry of entries.slice(seen)) {
      const dir = entry.dir === 'out' ? style.yellow('→') : style.green('←');
      deps.stdout.write(
        `${dir} ${style.cyan(entry.runtime)} ${entry.runtime}/${entry.target}${entry.source ? ` [${entry.source}]` : ''}: ${entry.text.replace(/\s+/g, ' ').slice(0, 160)}\n`
      );
    }
    seen = entries.length;
  }
  deps.stdout.write(`${style.gray('watch done')}\n`);
};

/**
 * @purpose Execute the peer command: dispatch a subcommand against agent sessions across runtimes.
 * @invariant Subcommands read only `rawArgs` (no direct `process.argv`), so they stay testable.
 * @param rawArgs CLI arguments after the command name (first element is the subcommand).
 * @param [deps] Injectable dependencies — defaults to real process implementations.
 * @returns Promise resolving after the subcommand completes.
 * @sideEffect Console: session listings, activity, ledger and reply output.
 * @consumers CLI (gennady)
 */
export async function run(rawArgs: string[], deps: PeerDeps = defaultDeps()): Promise<void> {
  const sub = rawArgs[0];
  const args = parse(rawArgs.slice(1));
  switch (sub) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'list':
      await commandList(args.options, deps);
      return;
    case 'read':
      await commandRead(args, deps);
      return;
    case 'ledger':
      commandLedger(args, deps);
      return;
    case 'watch':
      await commandWatch(args, deps);
      return;
    case 'init':
      await commandInit(args, deps);
      return;
    case 'forget':
      commandForget(args, deps);
      return;
    case 'send':
      await commandSend(args, deps);
      return;
    case 'ask':
      await commandAsk(args, deps);
      return;
    case 'fanout':
      await commandFanout(args, deps);
      return;
    default:
      deps.stderr.write(`${style.red(`Unknown peer subcommand: ${sub}`)}\n`);
      printHelp();
      deps.exit(1);
  }
}
