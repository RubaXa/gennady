// @file: CLI wrapper for alt-opinion — argument parsing, AI provider setup, output formatting, NFC-08 sanitization.
// @consumers: gennady.ts
// @tasks: TSK-24, TSK-26

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { logger } from '#logger';
import { parseAltOpinionArgs } from './alt-opinion-parser.ts';
import { runAltOpinion } from './alt-opinion-runner.ts';
import type {
  AltOpinionModel,
  AltOpinionModelPort,
  AltOpinionReport,
  AltOpinionResult,
  AltOpinionTelemetry,
} from './alt-opinion.types.ts';

/** @purpose Injectable dependencies for the alt-opinion CLI command — enables testing without real stdin/fs. */
export type AltOpinionCmdDeps = {
  /** @purpose Pre-read stdin content bypassing process.stdin */
  stdinContent?: string;
  /**
   * @purpose Sync file reader override — defaults to readFileSync
   * @param path File path to read.
   * @returns File content as string.
   */
  readFile?: (path: string) => string;
  /** @purpose AI SDK generateText override for testing */
  generateText?: typeof generateText;
  /** @purpose AI SDK createOpenAI override for testing */
  createOpenAI?: typeof createOpenAI;
};

// #region START_SANITIZE_OUTPUT — invariant: NFC-08; escapes anchor markers in model output to prevent injection
/**
 * @purpose Escape anchor markers in model output text to prevent NFC-08 injection.
 * @param content Raw model output text.
 * @returns Sanitized content safe for embedding in anchor blocks.
 */
function sanitizeOutput(content: string): string {
  return content
    .replace(/<!--START_ALT_OPINION_/g, '<\\!--START_ALT_OPINION_')
    .replace(/<!--END_ALT_OPINION_/g, '<\\!--END_ALT_OPINION_');
}
// #endregion END_SANITIZE_OUTPUT

// #region START_ANCHOR_KEY — invariant: uppercase provider-model with / replaced by -
/**
 * @purpose Derive anchor-safe key from a model descriptor (uppercase, / → -).
 * @param model Model descriptor.
 * @returns Anchor-safe identifier (e.g. "LLMPROXY-DEEPSEEK-V4-PRO").
 */
function resolveModelAnchorKey(model: AltOpinionModel): string {
  return `${model.provider}-${model.model}`.toUpperCase().replace(/\//g, '-');
}
// #endregion END_ANCHOR_KEY

// #region START_TELEMETRY_FORMAT — invariant: produces <!--TELEMETRY wall=<ms>ms [tokens=<p>/<c>] [reason=<r>]--> line
/**
 * @purpose Format a telemetry comment line for a model or synth block.
 * @param telemetry Optional telemetry data from AltOpinionResult or AltOpinionReport.
 * @returns Telemetry HTML comment string, or empty string if telemetry is undefined.
 */
function formatTelemetryLine(telemetry?: AltOpinionTelemetry): string {
  if (!telemetry) return '';
  const parts = [`wall=${Math.round(telemetry.wallMs)}ms`];
  if (telemetry.promptTokens != null && telemetry.completionTokens != null) {
    parts.push(`tokens=${telemetry.promptTokens}/${telemetry.completionTokens}`);
  }
  if (telemetry.finishReason) {
    parts.push(`reason=${telemetry.finishReason}`);
  } else if (telemetry.promptTokens == null && telemetry.completionTokens == null) {
    parts.push('reason=unknown');
  }
  return `<!--TELEMETRY ${parts.join(' ')}-->`;
}
// #endregion END_TELEMETRY_FORMAT

/**
 * @purpose Format a single model opinion block with anchors and telemetry.
 * @param result AltOpinionResult from the runner.
 * @returns Complete block string ready for stdout.
 */
function formatModelBlock(result: AltOpinionResult): string {
  const anchorKey = resolveModelAnchorKey(result.model);
  const body = result.success ? result.content : `Error: ${result.error}`;
  const telemetry = formatTelemetryLine(result.telemetry);
  const lines = [
    `<!--START_ALT_OPINION_${anchorKey}-->`,
    sanitizeOutput(body),
    `<!--END_ALT_OPINION_${anchorKey}-->`,
  ];
  if (telemetry) lines.push(telemetry);
  return lines.join('\n');
}

/**
 * @purpose CLI entry point for alt-opinion. Parses args, builds providers from env vars, AltOpinionModelPort map by "provider/model", invokes core runner, outputs to stdout.
 * *
 * @param rawArgs Raw CLI arguments (typically process.argv).
 * @param [deps] Optional injectable dependencies for testing.
 * @throws {Error} On parsing failures (missing model, unknown provider, empty input).
 * @returns AltOpinionReport with per-model results, exit code, and optional synthesis block.
 * @sideEffect FS: readFile for prompt files and --file resolution.
 * @sideEffect Env: reads LLM_PROXY_API_KEY, LLM_PROXY_BASE_URL, OPENROUTER_API_KEY.
 * @sideEffect Network: AI model API calls via @ai-sdk/openai.
 */
export async function run(rawArgs: string[], deps?: AltOpinionCmdDeps): Promise<AltOpinionReport> {
  const _generateText = deps?.generateText ?? generateText;
  const _createOpenAI = deps?.createOpenAI ?? createOpenAI;
  const startedAt = performance.now();
  logger.info('[altOpinionCmd#run] [idle → parsing]');

  // #region START_PARSE — invariant: parser validates provider, stdin/--file mutual exclusion, min 1 model
  const parsedArgs = parseAltOpinionArgs(rawArgs, {
    stdinContent: deps?.stdinContent,
  });
  // #endregion END_PARSE

  logger.info('[altOpinionCmd#run] [parsing → buildingProviders]', {
    modelCount: parsedArgs.models.length,
    hasSynth: !!parsedArgs.synthModel,
    strict: parsedArgs.strict,
  });

  // #region START_BUILD_PROVIDERS — invariant: llmproxy baseURL from env or default; openrouter fixed baseURL
  const llmproxyBaseUrl = process.env['LLM_PROXY_BASE_URL'] ?? 'https://llmproxy.example.com/v1';

  const llmproxy = _createOpenAI({
    apiKey: process.env['LLM_PROXY_API_KEY'],
    baseURL: llmproxyBaseUrl,
    name: 'llmproxy',
  });

  const openrouter = _createOpenAI({
    apiKey: process.env['OPENROUTER_API_KEY'],
    baseURL: 'https://openrouter.ai/api/v1',
    name: 'openrouter',
  });
  // #endregion END_BUILD_PROVIDERS

  const providers = { llmproxy, openrouter };

  // #region START_BUILD_PORTS — invariant: Map key = "provider/model"; lazy dedup; synth port from same provider as synthModel
  const modelPorts = new Map<string, AltOpinionModelPort>();

  for (const model of parsedArgs.models) {
    const key = `${model.provider}/${model.model}`;
    if (modelPorts.has(key)) continue;

    const provider = providers[model.provider];
    modelPorts.set(key, {
      async generate(prompt: string) {
        const r = await _generateText({
          model: provider.chat(model.model),
          prompt,
        });
        const usage =
          r.usage?.inputTokens != null && r.usage?.outputTokens != null
            ? { promptTokens: r.usage.inputTokens, completionTokens: r.usage.outputTokens }
            : undefined;
        return {
          content: r.text,
          usage,
          finishReason: r.finishReason,
        };
      },
    });
  }

  let synthPort: AltOpinionModelPort | undefined;
  if (parsedArgs.synthModel) {
    const synthProvider = providers[parsedArgs.synthModel.provider];
    synthPort = {
      async generate(prompt: string) {
        const r = await _generateText({
          model: synthProvider.chat(parsedArgs.synthModel!.model),
          prompt,
        });
        const usage =
          r.usage?.inputTokens != null && r.usage?.outputTokens != null
            ? { promptTokens: r.usage.inputTokens, completionTokens: r.usage.outputTokens }
            : undefined;
        return {
          content: r.text,
          usage,
          finishReason: r.finishReason,
        };
      },
    };
  }
  // #endregion END_BUILD_PORTS

  const readFile = deps?.readFile ?? ((p: string) => readFileSync(p, 'utf-8'));

  // #region START_RUN_RUNNER — invariant: runner handles parallel queries, timeout, synthesis, exitCode
  logger.info('[altOpinionCmd#run] [buildingProviders → running]');
  const report = await runAltOpinion(parsedArgs, {
    models: modelPorts,
    synth: synthPort,
    readFile,
  });
  // #endregion END_RUN_RUNNER

  // #region START_FORMAT_OUTPUT — invariant: synthContent prefabricated by runner; individual blocks wrapped in anchors; NFC-08 sanitization
  if (report.synthContent) {
    logger.info('[altOpinionCmd#run] [running → outputtingSynth]');
    const synthTelemetry = formatTelemetryLine(report.synthTelemetry);
    const output = synthTelemetry
      ? `${sanitizeOutput(report.synthContent)}\n${synthTelemetry}`
      : sanitizeOutput(report.synthContent);
    process.stdout.write(output + '\n');
  } else {
    logger.info('[altOpinionCmd#run] [running → outputtingResults]', {
      resultCount: report.results.length,
    });

    for (const result of report.results) {
      process.stdout.write(formatModelBlock(result) + '\n');
    }
  }
  // #endregion END_FORMAT_OUTPUT

  const elapsed = performance.now() - startedAt;
  logger.info(
    `[altOpinionCmd#run] [running → done] exitCode=${report.exitCode} (${elapsed.toFixed(2)}ms)`
  );

  return report;
}

// #region START_SELF_EXECUTING — invariant: self-executes only when file matches process.argv[1] (direct invocation)
if (process.argv[1]) {
  const selfPath = fileURLToPath(import.meta.url);
  if (selfPath === process.argv[1] || selfPath.endsWith(process.argv[1])) {
    run(process.argv)
      .then((report) => {
        process.exitCode = report.exitCode;
      })
      .catch((cause) => {
        const error = new Error('[altOpinionCmd] Self-execution failed', { cause });
        logger.error('[altOpinionCmd#run] [self-executing → failed]', { error });
        process.exit(1);
      });
  }
}
// #endregion END_SELF_EXECUTING
