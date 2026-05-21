// @file: Domain types and DI port for the alt-opinion command.
// @consumers: AltOpinionParser, AltOpinionRunner, AltOpinionCmd
// @tasks: TSK-23, TSK-26

/** @purpose Supported AI model providers for alt-opinion. */
export type AltOpinionProvider = 'llmproxy' | 'openrouter';

/**
 * @purpose Descriptor of a single AI model for opinion generation.
 * @invariant `provider` is validated against AltOpinionProvider at parse time.
 */
export type AltOpinionModel = {
  /** @purpose AI provider identifier | @invariant 'llmproxy' or 'openrouter' */
  provider: AltOpinionProvider;
  /** @purpose Model name in provider/{model-id} format */
  model: string;
  /** @purpose Optional per-model prompt file path (from :: syntax) */
  promptPath?: string;
};

/**
 * @purpose Telemetry data for a model call — wall time, token usage, and finish reason.
 */
export type AltOpinionTelemetry = {
  /** @purpose Wall-clock time elapsed in milliseconds */
  wallMs: number;
  /** @purpose Prompt token count from provider response */
  promptTokens?: number;
  /** @purpose Completion token count from provider response */
  completionTokens?: number;
  /** @purpose Finish reason from provider (e.g. 'stop', 'length') */
  finishReason?: string;
};

/**
 * @purpose Result of a single model call — either success with content or failure with error.
 */
export type AltOpinionResult =
  | {
      model: AltOpinionModel;
      success: true;
      content: string;
      telemetry?: AltOpinionTelemetry;
    }
  | {
      model: AltOpinionModel;
      success: false;
      error: string;
      telemetry?: AltOpinionTelemetry;
    };

/**
 * @purpose Aggregated report from the alt-opinion runner.
 * @invariant exitCode is 0 when at least one model succeeded (non-strict) or all succeeded (strict); 1 otherwise.
 */
export type AltOpinionReport = {
  /** @purpose Per-model results in the same order as --model arguments */
  results: AltOpinionResult[];
  /** @purpose Exit code: 0 for success, 1 for failure */
  exitCode: 0 | 1;
  /** @purpose Synthesized opinion content when --synthModel is used */
  synthContent?: string;
  /** @purpose Telemetry for the synthesis model call | @invariant Present only when --synthModel was used */
  synthTelemetry?: AltOpinionTelemetry;
};

/**
 * @purpose Parsed CLI arguments ready for the runner.
 */
export type AltOpinionParsedArgs = {
  /** @purpose Ordered list of models to query */
  models: AltOpinionModel[];
  /** @purpose Optional synthesis model */
  synthModel?: AltOpinionModel;
  /** @purpose --file argument value */
  file?: string;
  /** @purpose Resolved artifact content (from stdin or --file) */
  artifact?: string;
  /** @purpose Path to shared model prompt file */
  modelPromptPath?: string;
  /** @purpose Path to synthesis prompt file */
  synthPromptPath?: string;
  /** @purpose --strict flag: exit 1 on any model error */
  strict: boolean;
};

/**
 * @purpose DI port for AI model calls — allows mocking in tests without monkey-patching the AI SDK.
 * @invariant Implementations must resolve with the generated content and optional usage metadata, or reject with a descriptive error.
 */
export interface AltOpinionModelPort {
  /**
   * @purpose Generate a text response from the AI model for the given prompt.
   * @param prompt Complete prompt string to send to the model.
   * @returns Generated text with optional usage and finish reason metadata.
   * @throws {Error} On network failure, timeout, or API error.
   */
  generate(prompt: string): Promise<{
    content: string;
    usage?: { promptTokens: number; completionTokens: number };
    finishReason?: string;
  }>;
}
