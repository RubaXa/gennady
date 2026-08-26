// @file: Canonical OpenCode model selection for every Agent Inbox production entrypoint.
// @consumers: bootstrap, run-mode, OpenCodeReal, CLI validation

/** @purpose Stable production default independent of the operator's global OpenCode preference. */
export const DEFAULT_AGENT_INBOX_MODEL = 'llm-proxy/deepseek-v4-pro';

/**
 * @purpose Fast-tier default for conversational/low-judgment turns (chat, triage, enrich) —
 * cheaper than the review model and not bound to review-quality judgment.
 */
export const DEFAULT_AGENT_INBOX_FAST_MODEL = 'llm-proxy/deepseek-v4-flash';

/** @purpose Provider/model identity accepted by the OpenCode SDK prompt body. */
export type OpenCodeModelIdentity = {
  /** @purpose Provider identifier (e.g. `llm-proxy`). */
  providerID: string;
  /** @purpose Model identifier within the provider. */
  modelID: string;
};

/**
 * @purpose Parse the public `provider/model` notation without truncating path-like model IDs.
 * @param value Candidate model selector.
 * @returns Parsed identity, or null when either side of the first slash is empty.
 */
export function parseOpenCodeModel(value: string | undefined): OpenCodeModelIdentity | null {
  if (!value) return null;
  const slashIndex = value.indexOf('/');
  if (slashIndex <= 0 || slashIndex === value.length - 1) return null;
  return {
    providerID: value.slice(0, slashIndex),
    modelID: value.slice(slashIndex + 1),
  };
}
