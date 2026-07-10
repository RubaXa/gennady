// @file: Mock factory for OpenCode AI-node structured output responses.
// @consumers: inbox-opencode tests, inbox-roles tests
// @tasks: TSK-105

/**
 * @purpose A single finding from an AI review pass.
 */
export type OpenCodeFinding = {
  /** @purpose Severity level (blocking, warning, info) */
  severity: string;
  /** @purpose File path where the finding was flagged */
  file: string;
  /** @purpose Line number of the finding */
  line: number;
  /** @purpose Human-readable explanation of the finding */
  message: string;
};

/**
 * @purpose Structured output response from an OpenCode AI-node.
 * @invariant kind denotes the response type (review, classify, summarize, etc.).
 */
export type OpenCodeResponse = {
  /** @purpose Response type — which AI-node produced this output */
  kind: string;
  /** @purpose List of findings from the AI pass */
  findings: OpenCodeFinding[];
  /** @purpose Final verdict (request_changes, approved, commented) */
  verdict: string;
};

/** @purpose Default findings for a review-kind response. */
const DEFAULT_FINDINGS: OpenCodeFinding[] = [
  {
    severity: 'warning',
    file: 'src/utils.ts',
    line: 42,
    message: 'Potential null dereference — add guard before accessing property',
  },
  {
    severity: 'info',
    file: 'src/index.ts',
    line: 15,
    message: 'Consider extracting this block into a separate function for readability',
  },
];

/**
 * @purpose Create a mock OpenCode structured output response.
 * @param kind Response type (review, classify, summarize, etc.).
 * @param [overrides] Partial response to merge over defaults (excluding kind).
 * @returns Fully populated OpenCodeResponse.
 */
export function mockOpenCodeResponse(
  kind: string,
  overrides?: Partial<Omit<OpenCodeResponse, 'kind'>>
): OpenCodeResponse {
  const defaults: Omit<OpenCodeResponse, 'kind'> = {
    findings: DEFAULT_FINDINGS,
    verdict: 'request_changes',
  };

  if (!overrides) return { kind, ...defaults };
  return { kind, ...defaults, ...overrides };
}
