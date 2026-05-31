// @file: alt-opinion command help output
// @consumers: help command
/**
 * @purpose Print CLI help for the alt-opinion command.
 */
export function printHelp(): void {
  console.info(
    'gennady alt-opinion — Get alternative opinions from AI models with optional synthesis'
  );
  console.info('');
  console.info('Usage:');
  console.info('  npx gennady alt-opinion --model="provider/model" [options] < artifact.txt');
  console.info('  npx gennady alt-opinion --model="provider/model" --file=<path> [options]');
  console.info('');
  console.info('Options:');
  console.info('  --model=<spec>      Model descriptor: provider/model[::prompt.md] (repeatable)');
  console.info('  --synthModel=<spec> Synthesizer model (same format as --model)');
  console.info('  --file=<path>       Input file (mutually exclusive with stdin)');
  console.info('  --modelPrompt=<p>   Prompt file for all opinion models');
  console.info('  --synthPrompt=<p>   Prompt file for the synthesizer model');
  console.info('  --strict            Exit with code 1 if any model errors');
  console.info('');
  console.info('  Supported providers: llmproxy, openrouter.');
  console.info('  The ::prompt.md suffix loads a per-model custom prompt.');
  console.info('');
  console.info('Environment:');
  console.info('  LLM_PROXY_API_KEY     Required for llmproxy provider');
  console.info('  LLM_PROXY_BASE_URL    Override default base URL');
  console.info('  OPENROUTER_API_KEY    Required for openrouter provider');
  console.info('');
  console.info('Examples:');
  console.info('  npx gennady alt-opinion --model="llmproxy/gpt-4o" < spec.md');
  console.info(
    '  npx gennady alt-opinion --model="openrouter/gemini-pro" --synthModel="llmproxy/claude-sonnet" < spec.md'
  );
  console.info(
    '  npx gennady alt-opinion --model="llmproxy/gpt-4o::./custom.md" --file=./spec.md --strict'
  );
}
