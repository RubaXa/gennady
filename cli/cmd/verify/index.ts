// @file: Process adapter for the unified gennady verify command.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { runVerifyCommand } from './verify.cmd.ts';
import { parseVerifyInvocation } from './verify.types.ts';

// One-process-only hook capability. Consume it before any child is spawned so nested Verify calls
// cannot inherit permission to use the staged index as their repository candidate.
const stagedCandidate = process.env.GENNADY_INTERNAL_PRECOMMIT_INDEX === '1';
delete process.env.GENNADY_INTERNAL_PRECOMMIT_INDEX;

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
  stagedCandidate,
  ...(cancellationSignal === undefined ? {} : { cancellationSignal }),
});
for (const [signal, handler] of handlers) process.off(signal, handler);
if (result.stdout !== '') process.stdout.write(result.stdout);
if (result.stderr !== '') process.stderr.write(result.stderr);
process.exit(result.exitCode);
