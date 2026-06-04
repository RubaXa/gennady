// @file: Heuristic for detecting whether an agent session is waiting for operator input.
// @consumers: state/create-state-manager, state/group-by-provider
// @tasks: TSK-45

import type { AgentSession } from '../../../../services/agent-mon/model/agent-session.type.ts';

/**
 * @purpose Default regex patterns for detecting operator-waiting semantics in the last message.
 * @invariant Patterns are applied against session.lastMessage; order independent — any match → true.
 */
const DEFAULT_WAIT_PATTERNS: RegExp[] = [/[?]$/, /choose|select|pick|вариант|выбери/i];

/**
 * @purpose Determine whether an agent session is waiting for operator input based on last message content.
 * @invariant Pure function — no side effects, no I/O, deterministic given same inputs.
 * @param session Agent session data — uses only lastMessage field for detection.
 * @param [patterns] Regex patterns for waiting detection; uses DEFAULT_WAIT_PATTERNS when falsy.
 * @returns true if lastMessage matches any pattern, false otherwise (including when lastMessage is absent).
 */
export function isWaitingForUser(session: AgentSession, patterns?: RegExp[]): boolean {
  const effectivePatterns = patterns ?? DEFAULT_WAIT_PATTERNS;
  // invariant: no lastMessage → cannot be waiting
  if (!session.lastMessage) return false;

  // #region START_TEST_PATTERNS — invariant: any pattern match signals waiting; short-circuit on first match
  for (const pattern of effectivePatterns) {
    if (pattern.test(session.lastMessage)) return true;
  }
  // #endregion END_TEST_PATTERNS

  return false;
}
