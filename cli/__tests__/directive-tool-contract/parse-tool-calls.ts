// @file: Parser for documented `gennady` CLI calls inside sdd-v2 directive XML — pulls every
//   backtick-quoted invocation (table "Call" cells, worked examples, inline prose mentions) so the
//   contract test can drive the real CLI with the exact forms the directives promise.
// @consumers: directive-tool-contract.test.ts
// @tasks: N/A

/** @purpose One documented CLI invocation extracted from a directive file. */
export type DocumentedCall = {
  /** @purpose The exact backtick-span text, verbatim from the directive — used as a drift guard. */
  raw: string;
  /** @purpose The command token (`sdd-task`, `lint`, …). */
  cmd: string;
  /** @purpose Everything after the command token, verbatim (placeholders included). */
  argsRaw: string;
};

const KNOWN_COMMAND_PATTERN = 'sdd-[a-z]+|lint|yagni|testcov|orient';

// Matches `npx gennady <cmd> <rest>` — always counted, even with no args (`npx gennady sdd-task`,
// `npx gennady sdd-state`), since the `npx gennady` prefix itself signals "this is a call", per
// AX_TOOL_INVOCATION.
const PREFIXED = new RegExp(`^npx gennady\\s+(${KNOWN_COMMAND_PATTERN})(.*)$`);

// Matches a bare mention — `sdd-check --task <ticket>`, `gennady lint --spec=... --inventory-reverse
// ...` — as seen in audit.directive.xml's gate-mapping prose, which never uses the `npx gennady`
// prefix. Only counted when it carries actual args/flags beyond the bare command word, so a plain
// tool-name mention in the AX_TOOL_INVOCATION roster (`` `sdd-state` ``, `` `lint` ``, …) is not
// mistaken for a documented invocation.
const BARE = new RegExp(`^(?:gennady\\s+)?(${KNOWN_COMMAND_PATTERN})\\b(.*)$`);

/**
 * @purpose Extract every documented `gennady` CLI call from one directive's raw XML text.
 * @param text Full directive file content.
 * @returns Deduplicated (by verbatim backtick-span text) documented calls, in file order.
 */
export function extractDocumentedCalls(text: string): DocumentedCall[] {
  const seen = new Set<string>();
  const out: DocumentedCall[] = [];
  const spanRe = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(text)) !== null) {
    const span = m[1].trim();
    if (seen.has(span)) continue;

    const prefixedMatch = PREFIXED.exec(span);
    if (prefixedMatch) {
      seen.add(span);
      out.push({ raw: span, cmd: prefixedMatch[1], argsRaw: prefixedMatch[2].trim() });
      continue;
    }

    const bareMatch = BARE.exec(span);
    if (bareMatch && bareMatch[2].trim().length > 0) {
      seen.add(span);
      out.push({ raw: span, cmd: bareMatch[1], argsRaw: bareMatch[2].trim() });
    }
  }
  return out;
}
