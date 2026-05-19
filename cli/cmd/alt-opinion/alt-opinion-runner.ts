// @file: Core runner for alt-opinion — parallel model polling with optional synthesis.
// @consumers: AltOpinionCmd
// @tasks: TSK-23, TSK-26

import { logger } from '#logger';
import { performance } from 'node:perf_hooks';
import type {
  AltOpinionModel,
  AltOpinionModelPort,
  AltOpinionParsedArgs,
  AltOpinionReport,
  AltOpinionResult,
} from './alt-opinion.types.ts';

const MODEL_TIMEOUT_MS = 5 * 60 * 1000;

/** @purpose Default prompt: expert reviewer providing independent critical opinion. */
const DEFAULT_MODEL_PROMPT =
  'Ты — эксперт-рецензент. Проанализируй предоставленный контент и верни независимое, критическое мнение. Выдели сильные и слабые стороны, предложи улучшения. Будь конкретным, actionable и объективным.';

/** @purpose Default prompt: synthesis of multiple independent opinions into one consolidated opinion. */
const DEFAULT_SYNTH_PROMPT =
  'Ниже — несколько независимых мнений на один и тот же контент. Синтезируй их в одно консолидированное мнение. Выдели зоны согласия и разногласия, отметь повторяющиеся рекомендации. Верни сбалансированную, всестороннюю оценку.';

// #region START_SANITIZE — invariant: prompt injection prevention per NFC-08; escapes template markers in user content
/**
 * @purpose Escape template markers and anchor markers in artifact content to prevent prompt injection.
 * @param content Raw user-provided artifact content.
 * @returns Sanitized content safe to embed in the prompt template.
 * @sideEffect None (pure string transform).
 */
function sanitizeArtifact(content: string): string {
  return content
    .replace(/# CONTEXT:/g, '# CONTEXT\\:')
    .replace(/<!--START_ALT_OPINION_/g, '<\\!--START_ALT_OPINION_')
    .replace(/<!--END_ALT_OPINION_/g, '<\\!--END_ALT_OPINION_');
}
// #endregion END_SANITIZE

// #region START_MODEL_KEY — invariant: key format matches Map population in cmd layer
/**
 * @purpose Derive the Map key for an AltOpinionModel — used to look up the corresponding port in deps.models.
 * @param model Model descriptor.
 * @returns Key string in `provider/model` format.
 */
function resolveModelMapKey(model: AltOpinionModel): string {
  return `${model.provider}/${model.model}`;
}
// #endregion END_MODEL_KEY

// #region START_BUILD_PROMPT — invariant: per-model promptPath > shared modelPromptPath > embedded default
/**
 * @purpose Compose the full prompt for a single model call.
 * @param model Model descriptor with optional per-model promptPath.
 * @param artifact Sanitized artifact content.
 * @param deps Runner dependencies for reading prompt files.
 * @param modelPromptPath Shared model prompt path from CLI (--modelPrompt).
 * @returns Complete prompt string ready for the model.
 */
function buildPrompt(
  model: AltOpinionModel,
  artifact: string,
  deps: RunAltOpinionDeps,
  modelPromptPath?: string
): string {
  let prompt: string;

  if (model.promptPath) {
    prompt = deps.readFile(model.promptPath);
  } else if (modelPromptPath) {
    prompt = deps.readFile(modelPromptPath);
  } else {
    prompt = DEFAULT_MODEL_PROMPT;
  }

  return `# GOAL:\n${prompt}\n\n# CONTEXT:\n${artifact}`;
}
// #endregion END_BUILD_PROMPT

// #region START_QUERY_MODEL — sideEffect: network via port; invariant: timeout 5min, errors contained as AltOpinionResult
/**
 * @purpose Query a single AI model with a 5-minute timeout. Measures wall time via performance.now().
 * @param model Model descriptor.
 * @param port DI port for the model call.
 * @param prompt Complete prompt to send.
 * @returns AltOpinionResult — success with content+telemetry or failure with error+telemetry.
 * @sideEffect Network: AI model API call via port.generate().
 */
async function queryModel(
  model: AltOpinionModel,
  port: AltOpinionModelPort,
  prompt: string
): Promise<AltOpinionResult> {
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  const t0 = performance.now();

  try {
    const { content, usage, finishReason } = await new Promise<{
      content: string;
      usage?: { promptTokens: number; completionTokens: number };
      finishReason?: string;
    }>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort);
      port.generate(prompt).then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      );
    });
    const wallMs = performance.now() - t0;
    return {
      model,
      success: true,
      content,
      telemetry: {
        wallMs,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        finishReason,
      },
    };
  } catch (cause) {
    const wallMs = performance.now() - t0;
    const isTimeout = cause instanceof DOMException;
    const error = isTimeout ? 'timeout' : cause instanceof Error ? cause.message : String(cause);
    logger.error(`[queryModel] [querying → failed] ${model.provider}/${model.model}: ${error}`, {
      cause,
    });
    return { model, success: false, error, telemetry: { wallMs, finishReason: 'error' } };
  }
}
// #endregion END_QUERY_MODEL

/**
 * @purpose Dependencies for the alt-opinion runner, injected by the cmd layer.
 */
export type RunAltOpinionDeps = {
  /** @purpose Model ports keyed by `provider/model` string (e.g. "llmproxy/deepseek-v4-pro") */
  models: Map<string, AltOpinionModelPort>;
  /** @purpose Optional synthesis model port */
  synth?: AltOpinionModelPort;
  /** @purpose Synchronous file reader for resolving --file, per-model prompts, and shared prompts */
  readFile: (path: string) => string;
};

/**
 * @purpose Core alt-opinion runner — polls models in parallel and optionally synthesizes results.
 *
 * Resolves artifact content (from --file or pre-resolved stdin), sanitizes it against prompt injection,
 * queries all models in parallel via Promise.allSettled with per-model prompts, and optionally runs
 * synthesis when --synthModel is provided.
 *
 * @param args Parsed CLI arguments from parseAltOpinionArgs.
 * @param deps Runner dependencies: model port registry, optional synth port, and file reader.
 * @returns AltOpinionReport with per-model results, exit code, and optional synthesis block.
 * @throws {Error} When artifact is empty — validation before any model call.
 * @sideEffect FS: readFile for --file artifact resolution and prompt file loading.
 * @sideEffect Network: AI model API calls via injected ports.
 * @invariant Model results preserve the order of --model arguments (Promise.allSettled insertion order).
 * @invariant Timeout per model: 5 minutes via AbortSignal. Timeout → error in model block, not thrown.
 * @invariant Exit code: strict mode → 1 if ANY model failed; non-strict → 1 only if ALL failed.
 */
export async function runAltOpinion(
  args: AltOpinionParsedArgs,
  deps: RunAltOpinionDeps
): Promise<AltOpinionReport> {
  logger.info('[runAltOpinion] [idle → starting]', {
    modelCount: args.models.length,
    synthModel: !!args.synthModel,
    strict: args.strict,
  });

  // #region START_RESOLVE_ARTIFACT — invariant: --file path resolved via readFile, stdin already pre-resolved by parser
  let artifact: string;

  if (args.file) {
    artifact = deps.readFile(args.file);
  } else {
    artifact = args.artifact ?? '';
  }

  if (!artifact) {
    throw new Error('[runAltOpinion] Empty artifact — no content to analyze.');
  }

  artifact = sanitizeArtifact(artifact);
  // #endregion END_RESOLVE_ARTIFACT

  const startedAt = performance.now();

  // #region START_PARALLEL_QUERY — invariant: Promise.allSettled preserves insertion order; errors do not abort siblings
  const queryPromises = args.models.map((model) => {
    const port = deps.models.get(resolveModelMapKey(model));
    if (!port) {
      return Promise.resolve({
        model,
        success: false,
        error: `No port registered for ${resolveModelMapKey(model)}`,
      } as AltOpinionResult);
    }
    const prompt = buildPrompt(model, artifact, deps, args.modelPromptPath);
    logger.debug(`[runAltOpinion] [starting → querying] ${resolveModelMapKey(model)}`);
    return queryModel(model, port, prompt);
  });

  const settled = await Promise.allSettled(queryPromises);
  // #endregion END_PARALLEL_QUERY

  // #region START_COLLECT_RESULTS — invariant: order preserved by index mapping; settled promises should never reject (queryModel always resolves)
  const results: AltOpinionResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      model: args.models[i],
      success: false,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
  // #endregion END_COLLECT_RESULTS

  const elapsed = performance.now() - startedAt;

  // #region START_COMPUTE_EXIT_CODE — invariant: strict → fail-any, non-strict → fail-all
  const exitCode: 0 | 1 = args.strict
    ? results.some((r) => !r.success)
      ? 1
      : 0
    : results.every((r) => !r.success)
      ? 1
      : 0;
  // #endregion END_COMPUTE_EXIT_CODE

  // #region START_SYNTHESIS — invariant: runs only when --synthModel provided and at least one model succeeded; on failure returns exitCode 1
  if (args.synthModel && deps.synth) {
    const successful = results.filter((r): r is AltOpinionResult & { success: true } => r.success);

    if (successful.length === 0) {
      logger.warn(
        `[runAltOpinion] [running → failed] All models failed, cannot synthesize (${elapsed.toFixed(2)}ms)`
      );
      return { results, exitCode: 1 };
    }

    const opinionsBody = successful.map((r) => r.content).join('\n\n---\n\n');
    const synthPromptBody = args.synthPromptPath
      ? deps.readFile(args.synthPromptPath)
      : DEFAULT_SYNTH_PROMPT;
    const synthPrompt = `# GOAL:\n${synthPromptBody}\n\n# CONTEXT:\n${opinionsBody}`;

    logger.info(
      `[runAltOpinion] [querying → synthesizing] ${args.synthModel.provider}/${args.synthModel.model}`
    );

    const synthResult = await queryModel(args.synthModel, deps.synth, synthPrompt);

    if (synthResult.success) {
      const synthBlock = `<!--START_ALT_OPINION_SYNTH-->\n${synthResult.content}\n<!--END_ALT_OPINION_SYNTH-->`;
      logger.info(`[runAltOpinion] [running → completed] Synthesis done (${elapsed.toFixed(2)}ms)`);
      return {
        results,
        exitCode: 0,
        synthContent: synthBlock,
        synthTelemetry: synthResult.telemetry,
      };
    }

    logger.warn(
      `[runAltOpinion] [running → failed] Synthesis model failed: ${synthResult.error} (${elapsed.toFixed(2)}ms)`
    );
    return { results, exitCode: 1, synthContent: undefined };
  }
  // #endregion END_SYNTHESIS

  logger.info(
    `[runAltOpinion] [running → completed] ${results.length} models (${elapsed.toFixed(2)}ms)`
  );
  return { results, exitCode };
}
