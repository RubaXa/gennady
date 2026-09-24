// @file: Process adapter for the unified gennady verify command.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { runVerifyCommand } from './verify.cmd.ts';
import { parseVerifyInvocation } from './verify.types.ts';

const parsed = parseVerifyInvocation(process.argv);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(4);
}

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

const result = await runVerifyCommand(process.cwd(), parsed.invocation, {
  signal: abort.signal,
  ...(cancellationSignal === undefined ? {} : { cancellationSignal }),
});
for (const [signal, handler] of handlers) process.off(signal, handler);
if (result.stdout !== '') process.stdout.write(result.stdout);
if (result.stderr !== '') process.stderr.write(result.stderr);
process.exit(result.exitCode);
