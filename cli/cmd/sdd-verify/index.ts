// @file: Process adapter for the thin SDD-owned facade over universal Verify.
// @spec: CLI-SDD-VERIFY
// @consumers: gennady.ts

import { resolve } from 'node:path';
import { parseSddVerifyInvocation } from './sdd-verify-invocation.ts';
import { runSddVerifyFacade } from './sdd-verify.facade.ts';

const parsed = parseSddVerifyInvocation(process.argv);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(4);
}

const projectRoot = resolve('.');
const abort = new AbortController();
let cancellationSignal: 'SIGINT' | 'SIGTERM' | undefined;
const handlers = new Map<'SIGINT' | 'SIGTERM', () => void>();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  const handler = () => {
    cancellationSignal ??= signal;
    abort.abort(signal);
  };
  handlers.set(signal, handler);
  process.once(signal, handler);
}
const result = await runSddVerifyFacade(
  projectRoot,
  parsed.invocation.task,
  parsed.invocation.phase,
  {
    signal: abort.signal,
    ...(cancellationSignal === undefined ? {} : { cancellationSignal }),
  }
);
for (const [signal, handler] of handlers) process.off(signal, handler);
if (result.stdout !== '') process.stdout.write(result.stdout);
if (result.stderr !== '') process.stderr.write(result.stderr);
process.exit(result.exitCode);
