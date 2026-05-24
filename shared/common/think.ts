// @file: Remove think-blocks and preamble text from raw LLM response.
// @consumers: ai-legacy-model
// @tasks: N/A

const THINK_CLOSE_TAG = '</think>';

/** @purpose Remove think-blocks and preamble text from raw LLM response. */
export const removeThink = (raw: string): string => {
  const cleaned = String(raw ?? '')
    .split(THINK_CLOSE_TAG)
    .slice(-1)
    .join(THINK_CLOSE_TAG)
    .trim();

  if (/^(Хорошо,|Okay,)/.test(cleaned)) {
    return cleaned.split('\n\n\n').slice(-1).join('\n\n\n').trim();
  }

  return cleaned;
};
