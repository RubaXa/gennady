// @file: Custom argument parser for alt-opinion — handles :: syntax not supported by shared/parseArgs.
// @consumers: AltOpinionCmd
// @tasks: TSK-23

import { readFileSync } from 'node:fs';
import type {
  AltOpinionModel,
  AltOpinionParsedArgs,
  AltOpinionProvider,
} from './alt-opinion.types.ts';

const VALID_PROVIDERS: readonly AltOpinionProvider[] = ['llmproxy', 'openrouter'];

/**
 * @purpose Parse a single --model or --synthModel value into an AltOpinionModel descriptor.
 * @param raw The raw value after `=` (e.g. "llmproxy/gpt-4o::./custom.md").
 * @param flag The flag name for error messages ("--model" or "--synthModel").
 * @throws {Error} If provider is missing, unknown, or model is empty.
 * @returns Parsed model descriptor — promptPath is set only for `::` syntax.
 */
function parseModelArg(raw: string, flag: string): AltOpinionModel {
  const firstColonIdx = raw.indexOf('::');
  const modelPart = firstColonIdx === -1 ? raw : raw.slice(0, firstColonIdx);
  const promptPath = firstColonIdx === -1 ? undefined : raw.slice(firstColonIdx + 2);

  const slashIdx = modelPart.indexOf('/');
  if (slashIdx === -1) {
    throw new Error(
      `[parseAltOpinionArgs] ${flag} must be "provider/model", got "${raw}". ` +
        'Supported providers: llmproxy, openrouter.'
    );
  }

  const provider = modelPart.slice(0, slashIdx) as AltOpinionProvider;
  const model = modelPart.slice(slashIdx + 1);

  if (!model) {
    throw new Error(`[parseAltOpinionArgs] ${flag} is missing model name after "/", got "${raw}".`);
  }

  if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `[parseAltOpinionArgs] Unknown provider "${provider}" in ${flag}. ` +
        'Supported providers: llmproxy, openrouter.'
    );
  }

  return { provider, model, promptPath };
}

/**
 * @purpose Parse CLI arguments for the alt-opinion command.
 *
 * Parses repeated --model, optional --synthModel, --file, --modelPrompt, --synthPrompt, --strict.
 * Validates provider names, mutual exclusion of stdin/--file, :: syntax for per-model prompts,
 * and minimum model count.
 *
 * @param rawArgs Raw CLI arguments (typically process.argv).
 * @param opts Options bag carrying pre-read stdin content for test injection.
 *   When omitted and stdin is not a TTY, the parser reads stdin synchronously.
 * @throws {Error} On validation failures (missing model, unknown provider, mutual exclusion, etc.).
 * @returns Parsed arguments with resolved artifact content.
 * @sideEffect FS: reads stdin when not TTY and opts.stdinContent not provided. Actual data presence is determined by non-empty trimmed content.
 */
export function parseAltOpinionArgs(
  rawArgs: string[],
  opts?: { stdinContent?: string }
): AltOpinionParsedArgs {
  const models: AltOpinionModel[] = [];
  let synthModel: AltOpinionModel | undefined;
  let file: string | undefined;
  let modelPromptPath: string | undefined;
  let synthPromptPath: string | undefined;
  let strict = false;

  const argsList = rawArgs.slice(2);

  // #region START_PARSE_FLAGS — invariant: each --flag resolved once, repeated --model accumulates
  for (const arg of argsList) {
    if (!arg.startsWith('--')) continue;

    const clean = arg.replace(/^-+/, '');
    const eqIdx = clean.indexOf('=');
    const key = eqIdx === -1 ? clean : clean.slice(0, eqIdx);
    const rawValue = eqIdx === -1 ? '' : clean.slice(eqIdx + 1);
    const value = rawValue.replace(/^"|"$/g, '');

    switch (key) {
      case 'model':
        models.push(parseModelArg(value, '--model'));
        break;
      case 'synthModel':
        synthModel = parseModelArg(value, '--synthModel');
        break;
      case 'file':
        file = value;
        break;
      case 'modelPrompt':
        modelPromptPath = value;
        break;
      case 'synthPrompt':
        synthPromptPath = value;
        break;
      case 'strict':
        strict = true;
        break;
    }
  }
  // #endregion END_PARSE_FLAGS

  // #region START_VALIDATE — invariant: min 1 model, no mutual exclusion, provider known
  if (models.length === 0) {
    throw new Error(
      '[parseAltOpinionArgs] At least one --model is required. ' +
        'Usage: gennady alt-opinion --model="provider/model" [--model="..."] ...'
    );
  }
  // #endregion END_VALIDATE

  // #region START_RESOLVE_ARTIFACT — invariant: exactly one input source (stdin or --file); stdin detected by data presence, not TTY flag
  let stdinContent: string | undefined;

  if (opts?.stdinContent !== undefined) {
    stdinContent = opts.stdinContent.trim().length > 0 ? opts.stdinContent : undefined;
  } else if (!process.stdin.isTTY) {
    const raw = readFileSync(process.stdin.fd, 'utf-8');
    stdinContent = raw.trim().length > 0 ? raw : undefined;
  }

  const hasStdin = stdinContent !== undefined;

  if (file && hasStdin) {
    throw new Error(
      '[parseAltOpinionArgs] --file and stdin are mutually exclusive. ' +
        'Provide either --file=<path> or pipe content to stdin, not both.'
    );
  }

  let artifact: string | undefined;

  if (file) {
    artifact = file;
  } else if (stdinContent !== undefined) {
    artifact = stdinContent;
  } else {
    throw new Error(
      '[parseAltOpinionArgs] No input provided. ' +
        'Either pipe content to stdin or use --file=<path>.'
    );
  }
  // #endregion END_RESOLVE_ARTIFACT

  return {
    models,
    synthModel,
    file,
    artifact,
    modelPromptPath,
    synthPromptPath,
    strict,
  };
}
