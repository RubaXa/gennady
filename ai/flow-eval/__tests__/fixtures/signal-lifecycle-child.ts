// @file: Tiny subprocess fixture proving real SIGINT/SIGTERM use the production lifecycle boundary.
// @spec: AI-SKILLS
// @consumers: signal-lifecycle.test.ts

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SddEvalSandboxLifecycle } from '../../sandbox-lifecycle.ts';

const root = process.argv[2];
const signal = process.argv[3] as 'SIGINT' | 'SIGTERM';
if (!root || (signal !== 'SIGINT' && signal !== 'SIGTERM')) {
  throw new Error('usage: signal-lifecycle-child.ts ROOT SIGINT|SIGTERM');
}
const owned = mkdtempSync(join(root, 'sdd-flow-eval-'));
mkdirSync(join(owned, 'specs'), { recursive: true });
writeFileSync(join(owned, 'specs/interrupted.spec.md'), '# interrupted\n');
const lifecycle = new SddEvalSandboxLifecycle({
  sandboxRoot: root,
  artifactsRoot: join(root, 'artifacts'),
  runId: `run-${signal}`,
  keep: false,
});
lifecycle.registerOwnedDirectory('interrupted', owned);
const controller = new AbortController();
const boundary = lifecycle.installSignalHandlers(controller);
process.kill(process.pid, signal);
await new Promise<void>((resolve) => setImmediate(resolve));
const received = boundary.received();
if (!received || !controller.signal.aborted) throw new Error('signal was not observed');
const finalized = await lifecycle.finalize(received);
boundary.dispose();
process.stdout.write(`${JSON.stringify({ signal: received, finalized })}\n`);
process.exitCode = received === 'SIGINT' ? 130 : 143;
