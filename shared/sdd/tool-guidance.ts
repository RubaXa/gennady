// @file: One schema-first text envelope for actionable SDD CLI failures.
// @consumers: sdd-new, sdd-check, sdd-log, sdd-task
// @tasks: N/A

/** @purpose Required fields every flow-tool failure exposes to an agent. */
export type SddToolGuidance = {
  /** @purpose Flow tool emitting the failure. */
  tool: 'sdd-new' | 'sdd-check' | 'sdd-log' | 'sdd-task';
  /** @purpose Stable machine-facing error code. */
  code: string;
  /** @purpose Original first-line subject retained for compatibility and fast scanning. */
  headline?: string;
  /** @purpose Exact command argument or repository object affected. */
  object: string;
  /** @purpose Concrete cause, preserving the original tool diagnostic. */
  reason: string;
  /** @purpose Safe repair action, distinct from permission to continue execution. */
  action: string;
  /** @purpose Copy-ready example of the corrected tool call or structure. */
  example: string;
};

/**
 * @purpose Upgrade a legacy prose diagnostic into the common schema while preserving its detail.
 * @param guidance Tool/code/object/repair defaults for the failed invocation.
 * @param message Existing diagnostic whose detail becomes the reason.
 * @returns Existing message when already complete, otherwise a schema-first rendering.
 */
export function normalizeSddToolFailure(
  guidance: Omit<SddToolGuidance, 'reason'>,
  message: string
): string {
  if (
    /^\s*object:/m.test(message) &&
    /^\s*reason:/m.test(message) &&
    /^\s*(?:next|action):/m.test(message) &&
    /^\s*example(?:-name|-path)?:/m.test(message)
  )
    return message;
  const lines = message.split('\n');
  const codeAt = (lines[0] ?? '').indexOf(guidance.code);
  const headline =
    codeAt >= 0
      ? (lines[0] ?? '')
          .slice(codeAt + guidance.code.length)
          .replace(/^:\s*/, '')
          .trim()
      : '';
  const detail = lines
    .map((line, index) => {
      if (index > 0) return line.trim();
      return codeAt >= 0
        ? line
            .slice(codeAt + guidance.code.length)
            .replace(/^:\s*/, '')
            .trim()
        : line.trim();
    })
    .filter(Boolean)
    .join(' | ');
  const normalized: SddToolGuidance = {
    ...guidance,
    ...(headline ? { headline } : {}),
    reason: detail || 'the requested transition could not be proved',
  };
  return [
    `[${normalized.tool}] ${normalized.code}${normalized.headline ? `: ${normalized.headline}` : ''}`,
    `  object: ${normalized.object}`,
    `  reason: ${normalized.reason}`,
    `  action: ${normalized.action}`,
    `  example: ${normalized.example}`,
  ].join('\n');
}
