// @file: Bounded live Flash-only semantic calibration, with durable failures and per-call cleanup.
// @spec: AI-SKILLS
// @consumers: authoring measurement qualification; independent judge review

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAuthoringSemanticControls } from '../authoring-semantic-controls.ts';
import { buildAuthoringFixture, getAuthoringCase } from '../authoring-benchmark.ts';
import { captureAuthoringJudgeEvidence } from '../authoring-judge-evidence.ts';
import { authoringSourceTreeDigest, readAuthoringRuntimeVersion } from '../authoring-protocol.ts';
import { createSddEvalOpenCodeClient } from '../opencode-client.ts';
import { SddEvalOpenCodeRuntime } from '../opencode-runtime.ts';
import { SddEvalOpenCodeEvidenceSource } from '../evidence.ts';
import { SddEvalJudge } from '../judge.ts';
import { safeVerifyText } from '../../../shared/verify/reporting/report-safety.ts';
import type { SddEvalUsage } from '../types.ts';
import { withEvalSignal } from '../eval-signal.ts';
import { finalizeAuthoringCalibration } from '../authoring-calibration-cleanup.ts';
import { projectAuthoringJudgeTerminal } from '../authoring-calibration-terminal.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const model = { providerID: 'llm-proxy', modelID: 'deepseek-v4-flash' };
const modelName = `${model.providerID}/${model.modelID}`;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** @purpose Refuse implicit endpoints, other providers, dirty source and overwrite of a prior campaign. */
async function main(argv: string[], signal: AbortSignal) {
  if (argv.length !== 4 || argv[0] !== '--server' || argv[2] !== '--out')
    throw new Error(
      'usage: authoring-semantic-calibration.ts --server http://127.0.0.1:PORT --out NEW_DIRECTORY'
    );
  const baseUrl = new URL(argv[1]!);
  if (
    baseUrl.protocol !== 'http:' ||
    baseUrl.hostname !== '127.0.0.1' ||
    !baseUrl.port ||
    Number(baseUrl.port) < 4097 ||
    baseUrl.pathname !== '/' ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  )
    throw new Error('Use an explicitly owned loopback server on port >=4097');
  for (const name of ['LLM_PROXY_BASE_URL', 'LLM_PROXY_API_KEY'])
    if (!process.env[name]) throw new Error(`${name} is missing; no fallback route is permitted`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repository, env, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain'))
    throw new Error('Calibration requires a clean committed source');
  const sourceCommit = git('rev-parse', 'HEAD');
  const runtimeVersion = await readAuthoringRuntimeVersion(baseUrl.origin);
  if (!runtimeVersion) throw new Error('Server/model/config identity is not verified Flash-only');
  const output = resolve(argv[3]!);
  mkdirSync(output); // EEXIST is intentional: never replace a previous failed campaign.
  const controls = buildAuthoringSemanticControls();
  const protocol = {
    schema: 'gennady.authoring-semantic-calibration.1',
    sourceCommit,
    runtimeVersion,
    model: modelName,
    repetitions: 2,
    deadlineMs: 60000,
    concurrency: 1,
    sourceDigest: await authoringSourceTreeDigest(repository, [
      'ai/flow-eval/scripts/authoring-semantic-calibration.ts',
    ]),
    controls,
    controlsSha256: sha(JSON.stringify(controls)),
    scope:
      'Known-label portal/library calibration, not worker authoring A/B; infrastructure is unqualified.',
    labelsHidden: true,
    hostOracleHidden: true,
  };
  const freeze = JSON.stringify(protocol, null, 2) + '\n';
  writeFileSync(join(output, 'protocol.json'), freeze, { flag: 'wx' });
  const rows: Array<Record<string, unknown>> = [];
  const save = () =>
    writeFileSync(
      join(output, 'results.json'),
      JSON.stringify(
        {
          protocolSha256: sha(freeze),
          planned: controls.length * 2,
          recorded: rows.length,
          complete: rows.length === controls.length * 2 && !signal.aborted,
          interrupted: signal.aborted,
          rows,
        },
        null,
        2
      ) + '\n'
    );
  save();
  for (let repetition = 1; repetition <= 2; repetition++) {
    for (const control of controls) {
      signal.throwIfAborted();
      const directory = mkdtempSync(join(output, '.run-'));
      const sessions = new Set<string>();
      const client = createSddEvalOpenCodeClient({ baseUrl: baseUrl.origin, directory });
      const runtime = new SddEvalOpenCodeRuntime({ client, directory });
      const evidenceSource = new SddEvalOpenCodeEvidenceSource({ client, directory });
      const row: Record<string, unknown> = {
        id: control.id,
        repetition,
        expected: control.expected,
        artifactSha256: control.artifactSha256,
        status: 'error',
      };
      const startedAt = Date.now();
      const safeReason = (cause: unknown) =>
        safeVerifyText(cause instanceof Error ? cause.message : String(cause), directory);
      const persistAttempt = () => {
        const path = join(output, `${control.id}-r${repetition}.json`);
        writeFileSync(`${path}.tmp`, JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
        renameSync(`${path}.tmp`, path);
      };
      try {
        const definition = getAuthoringCase(control.caseId);
        const files = {
          ...buildAuthoringFixture(control.caseId),
          [definition.target]: control.artifact,
        };
        for (const [path, text] of Object.entries(files)) {
          mkdirSync(dirname(join(directory, path)), { recursive: true });
          writeFileSync(join(directory, path), text);
        }
        const captured = captureAuthoringJudgeEvidence(directory, control.caseId);
        if (!captured.complete || captured.sha256 !== control.artifactSha256)
          throw new Error('Control evidence was not captured intact');
        const { oracle: _hiddenOracle, ...authoring } = captured;
        const judge = new SddEvalJudge(
          {
            createSession: (input) => runtime.createSession(input),
            prompt: (input) => runtime.prompt(input),
            judge: (input) =>
              runtime.judge({
                ...input,
                onSession: (id) => {
                  sessions.add(id);
                  input.onSession?.(id);
                },
              }),
          },
          model,
          60000
        );
        const result = await judge.evaluate(
          `${control.id}-r${repetition}`,
          directory,
          {
            intent: definition.brief,
            state: { status: 'completed', stuck: false, waiting: false, errors: [] },
            diff: '',
            events: [],
            tail: [],
            authoring,
          },
          signal
        );
        if (!result.sessionId) throw new Error('Missing actual judge session identity');
        Object.assign(row, {
          status: 'judged',
          sessionId: result.sessionId,
          verdict: result.verdict,
          rationale: safeVerifyText(result.rationale, directory),
        });
        persistAttempt();
        const captureSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
        const messages = await withEvalSignal(
          () =>
            client.session.messages({
              path: { id: result.sessionId! },
              query: { directory },
              signal: captureSignal,
            }),
          captureSignal
        );
        if (messages.error || !messages.data)
          throw new Error('Public terminal capture unavailable');
        const terminal = projectAuthoringJudgeTerminal(messages.data);
        row.publicTerminalMetadata = terminal;
        persistAttempt();
        const usage: SddEvalUsage = await withEvalSignal(
          () => evidenceSource.readUsage(result.sessionId!),
          captureSignal
        );
        const trajectory = await withEvalSignal(
          () => evidenceSource.readTrajectory(result.sessionId!),
          captureSignal
        );
        const tools = trajectory.entries.flatMap((entry) => entry.toolCalls).length;
        const models = usage.models ?? [];
        const trusted =
          usage.complete === true &&
          usage.sessions === 1 &&
          models.length === 1 &&
          models[0] === modelName &&
          trajectory.coverage.complete === true &&
          trajectory.coverage.sessions === 1 &&
          tools === 0 &&
          terminal.sessionId === result.sessionId &&
          terminal.model === modelName &&
          !terminal.errorPresent &&
          terminal.publicTextPresent;
        Object.assign(row, {
          status: trusted ? 'recorded' : 'unqualified',
          verdict: result.verdict,
          rationale: safeVerifyText(result.rationale, directory),
          usage,
          tools,
          captureComplete: trajectory.coverage.complete,
          matched: trusted && result.verdict === control.expected,
        });
        if (!trusted) throw new Error('Actual model/tool/capture identity failed qualification');
      } catch (cause) {
        row.error = safeVerifyText(
          cause instanceof Error ? cause.message : String(cause),
          directory
        );
      } finally {
        row.elapsedMs = Date.now() - startedAt;
        rows.push(row);
        const cleanup = await finalizeAuthoringCalibration({
          sessions: [...sessions],
          persist: () => {
            persistAttempt();
            save();
          },
          abort: (id) => runtime.abort(id),
          removeSession: async (id) => {
            const deleted = await client.session.delete({
              path: { id },
              query: { directory },
              signal: AbortSignal.timeout(10000),
            });
            if (deleted.error || !deleted.data) throw new Error('Owned session deletion failed');
          },
          removeDirectory: () => rmSync(directory, { recursive: true, force: false }),
          safeReason,
        });
        row.cleanup = cleanup;
        persistAttempt();
        save();
        process.stdout.write(
          `${JSON.stringify({ id: control.id, repetition, status: row.status, verdict: row.verdict, matched: row.matched, cleanupErrors: cleanup.errors.length })}\n`
        );
      }
      if (row.error || (row.cleanup as { errors: unknown[] }).errors.length)
        throw new Error('Calibration stopped after a retained error; no fallback or silent retry');
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  if (rows.some((row) => row.matched !== true)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  let errorExit = 1;
  const interrupts = [
    [
      'SIGINT',
      () => {
        errorExit = 130;
        controller.abort(new Error('Calibration interrupted by SIGINT'));
      },
    ],
    [
      'SIGTERM',
      () => {
        errorExit = 143;
        controller.abort(new Error('Calibration interrupted by SIGTERM'));
      },
    ],
  ] as const;
  for (const [name, handler] of interrupts) process.once(name, handler);
  main(process.argv.slice(2), controller.signal)
    .catch((cause: unknown) => {
      process.stderr.write(
        `${safeVerifyText(cause instanceof Error ? cause.message : String(cause), repository)}\n`
      );
      process.exitCode = errorExit;
    })
    .finally(() => {
      for (const [name, handler] of interrupts) process.removeListener(name, handler);
    });
}
