// @file: run — the harness CLI entry: `--scenario s1 --agent mock|opencode [--keep]`.
// @consumers: npm run harness
// @tasks: N/A (eval harness, not published)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { runHarness, type Scenario, type HarnessReport } from './core/harness.ts';
import type { Workspace } from './core/workspace.ts';
import { MockAgent, type MockTurn } from './port/mock-agent.ts';
import { s1Fixture } from './scenarios/s1-fixture.ts';
import { AgentPort } from './port/agent.port.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const REFERENCE_DIR = join(HERE, 'fixtures', '_reference-tic-tac-toe');
const REFERENCE_FILES = ['src/game.ts', 'src/cli.ts', 'test/game.test.ts', 'test/cli.test.ts'];

const SCENARIOS: Record<string, Scenario> = { s1: s1Fixture };

/** @purpose Parse `--flag value` / `--flag` argv into a plain map. */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

/** @purpose Load the gold reference files as mock writes — the proven-satisfiable tic-tac-toe. */
function referenceWrites(): MockTurn {
  return {
    text: 'implemented + tested (gold reference)',
    writes: REFERENCE_FILES.map((path) => ({
      path,
      content: readFileSync(join(REFERENCE_DIR, path), 'utf8'),
    })),
  };
}

/**
 * @purpose An offline scenario variant that proves the whole S1 pipeline with no model — the mock
 *   authors the gold reference, then real `npm run coverage` + `gennady testcov` gate it.
 * @invariant The coverage gate runs the repo's own gennady via tsx (no gennady install needed
 *   offline); a real run uses the workspace's synced `npx gennady` instead.
 */
function mockScenario(): Scenario {
  const gennady = join(REPO_ROOT, 'cli', 'gennady.ts');
  return {
    ...s1Fixture,
    steps: [{ label: 'execute (mock=gold)', text: 'author the ready ticket TTT-core' }],
    expect: {
      requiredFiles: s1Fixture.expect.requiredFiles,
      writtenFiles: s1Fixture.expect.writtenFiles,
      testCommand: ['npm', 'run', 'coverage'],
      gateCommands: [
        {
          name: 'coverage',
          cmd: ['node', '--import', 'tsx', gennady, 'testcov', '--min=90', 'src/game.ts'],
        },
      ],
    },
  };
}

/** @purpose Install the workspace's own devDependencies (tsx, c8) from the public registry. */
function npmInstall(ws: Workspace): void {
  execFileSync(
    'npm',
    ['install', '--registry', 'https://registry.npmjs.org', '--no-audit', '--no-fund'],
    {
      cwd: ws.dir,
      stdio: 'inherit',
    }
  );
}

/** @purpose Print a report as a compact, readable pass/fail with per-check evidence. */
function printReport(report: HarnessReport): void {
  console.log(`\n=== S1 harness report — ${report.ok ? 'GREEN ✅' : 'RED ❌'} ===`);
  console.log(`workspace: ${report.workspace}`);
  for (const s of report.flow.steps)
    console.log(`  step ${s.label}: ${s.ok ? 'ok' : `FAILED — ${s.detail}`}`);
  for (const c of report.verify.checks) console.log(`  ${c.ok ? '✔' : '✗'} ${c.name}: ${c.detail}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    console.log('scenarios:', Object.keys(SCENARIOS).join(', '));
    return;
  }
  const scenarioId = args.scenario ?? 's1';
  const agentKind = args.agent ?? 'mock';
  if (!SCENARIOS[scenarioId]) throw new Error(`unknown scenario "${scenarioId}" — try --list`);

  if (agentKind === 'opencode') {
    throw new Error(
      'agent "opencode" is not wired yet — build harness/port/opencode-server-agent.ts (Server mode via ' +
        '@opencode-ai/sdk) and harness/core/gennady-setup.ts, then rerun. Use --agent mock for the offline proof.'
    );
  }
  if (agentKind !== 'mock') throw new Error(`unknown agent "${agentKind}" — use mock | opencode`);

  const agent: AgentPort = new MockAgent([referenceWrites()]);
  const report = await runHarness(mockScenario(), agent, {
    setup: npmInstall,
    keepWorkspace: args.keep === 'true',
  });
  printReport(report);
  if (args.keep === 'true') console.log(`(kept: ${relative(process.cwd(), report.workspace)})`);
  process.exitCode = report.ok ? 0 : 1;
}

await main();
