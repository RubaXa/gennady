// @file: Universal log filter — extracts complete error blocks (anchor + context) from CI job logs.
// @consumers: vcs-job-log, vcs-pipeline
// @tasks: TSK-85

/** @purpose ANSI escape sequence regex. */
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

/**
 * @purpose GitLab CI section markers (`section_start:<ts>:<name>` / `section_end:...`).
 * @invariant Name is lowercase-only on purpose: real markers are snake_case, and a greedy
 *   `[\w-]+` would swallow glued uppercase output (`..._variablesERROR: Job failed`).
 */
const SECTION_MARKER_RE = /section_(?:start|end):\d+:[a-z][a-z0-9_-]*/g;

// #region START_NORMALIZE_RAW_LOG
/**
 * @purpose Normalize a raw trace before line analysis: drop ANSI, resolve `\r` redraws,
 * and isolate glued GitLab section markers onto their own lines.
 * @invariant `\r` progress redraw keeps only the final segment of each physical line.
 * @param rawLog Raw job trace from the GitLab API.
 * @returns Normalized log text.
 */
function normalizeRawLog(rawLog: string): string {
  return rawLog
    .replace(ANSI_RE, '')
    .split('\n')
    .map((line) => line.split('\r').pop() ?? '')
    .join('\n')
    .replace(SECTION_MARKER_RE, (marker) => `\n${marker}\n`);
}
// #endregion END_NORMALIZE_RAW_LOG

/**
 * @purpose Hard failure anchors — a matching line opens an error block.
 * @invariant Bare `Error:`/`cause:` lines are not anchors (negative-path output of passing
 *   tests floods the report); they are context only.
 */
const ANCHOR_PATTERNS: RegExp[] = [
  /^\s*(✖|❌|🛑|×|✗|✘)\s/,
  /^\s*(FAIL|FAILED)\b/,
  /^\s*[─—⎯-]*\s*Failed Tests?\b/,
  /^\s*\d+\)\s+\S/,
  /^\s*not\s+ok\s+\d+/i,
  /^\[(FAILED|ERROR)\]/i,
  /:\d+:\d+:\s+(error|warning)/i,
  /^\s*(ERROR|FATAL):\s/,
  /\b(AssertionError|TypeError|SyntaxError|ReferenceError|RangeError|AggregateError|RecursionError|URIError|EvalError|PanicError)\b/,
  /Traceback \(most recent call last\)/,
  /\bexit (code|status)\s*[1-9]/i,
  /\b\d+\s+(failed|passing|passed|pending)\b/i,
  /\b(tests?|specs?|suites?|files?)\s+\d+\s+failed\b/i,
  /^\s*TAP version/i,
];

/**
 * @purpose Context lines — pulled in around anchors so an error arrives whole:
 * assertion diff, code frame, stack trace, cause chain, artifact paths, separators.
 */
const CONTEXT_PATTERNS: RegExp[] = [
  /^\s+at\s+/,
  /^\s*❯\s/,
  /^\s*>?\s*\d*\s*[|│]/,
  /^[^a-zA-Z0-9]{0,6}\^+\s*$/,
  /^\s*(Expected|Received)\b/,
  /^\s*expect\(/,
  /^\s*(Locator|Timeout|Call log|Unexpected value|Actual value|Expected string|Received string|Error Context):/i,
  /^\s*-\s+(?:Expect\b|waiting for|locator resolved|attempting|retrying|unexpected value|navigating to)/i,
  /^\s*[Cc]ause:/,
  /Error:/,
  /^\s*attachment\b/i,
  /^\s*[─—⎯-]{5,}\s*$/,
  /^\s*[\p{L}\p{N}._/@-]+\.(png|jpe?g|webm|gif|json|md|zip|xml|txt|log|har)\s*$/u,
];

/** @purpose Legacy weak patterns — fallback when a log contains no hard anchor at all. */
const FALLBACK_PATTERNS: RegExp[] = [
  /^\s*(✖|❌|⚠|🛑|× |✗ |FAIL |●|▶)/,
  /:\d+:\d+:\s+(error|warning)/i,
  /^\s+at\s+/,
  /ERR_[A-Z_]+/,
  /(Error|TypeError|SyntaxError|AssertionError|AggregateError):/,
  /(failed|passed|errors?|warnings?)\s*[:\d]/i,
  /exit (code|status)\s*[1-9]/i,
  /\b(tests?|specs?|suites?)\s+\d+\s+failed/i,
  /\d+\s+(failed|passing|pending)/i,
  /^\[(FAILED|ERROR|PASSED)\]/i,
  /^\s*\d+\)\s/,
  /(FAIL|PASS)\s{2,}/,
  /^TAP version/i,
  /^\s*not\s+ok\s+\d+/i,
];

/** @purpose Max lines a single block may absorb forward from its anchor. */
const MAX_BLOCK_LINES = 60;

/** @purpose Max lines emitted overall — hard stop against pathological dumps. */
const MAX_OUTPUT_LINES = 2000;

/** @purpose Max chars per emitted line — protects tokens against minified-code blobs. */
const MAX_LINE_CHARS = 4000;

/** @purpose True when the line opens an error block. */
function isAnchor(line: string): boolean {
  return line.trim() !== '' && ANCHOR_PATTERNS.some((p) => p.test(line));
}

/** @purpose True when the line belongs to an error block (kept only when adjacent to an anchor). */
function isContext(line: string): boolean {
  return CONTEXT_PATTERNS.some((p) => p.test(line));
}

/** @purpose Drop trailing whitespace and decorative dash runs, then truncate an over-long line. */
function tidyLine(line: string): string {
  const tidied = line.replace(/\s*[─—⎯-]{5,}\s*$/, '').replace(/[ \t]+$/, '');
  if (tidied.length <= MAX_LINE_CHARS) return tidied;
  return `${tidied.slice(0, MAX_LINE_CHARS)} … [line truncated]`;
}

// #region START_RENDER_INCLUDED
/**
 * @purpose Render included line indices as blocks, marking elided regions and trimming edges.
 * @param lines All log lines (ANSI-stripped).
 * @param included Set of indices to emit.
 * @returns Readable multi-block report string.
 */
function renderIncluded(lines: string[], included: Set<number>): string {
  const out: string[] = [];
  let last = -1;

  for (const idx of [...included].sort((a, b) => a - b)) {
    if (last !== -1 && idx - last > 1) {
      out.push('', `… (${idx - last - 1} lines skipped)`, '');
    }
    out.push(tidyLine(lines[idx]));
    last = idx;
  }

  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();

  if (out.length > MAX_OUTPUT_LINES) {
    return (
      out.slice(0, MAX_OUTPUT_LINES).join('\n') +
      `\n… [output truncated at ${MAX_OUTPUT_LINES} lines — use --raw for the full log]`
    );
  }

  return out.join('\n');
}
// #endregion END_RENDER_INCLUDED

// #region START_FALLBACK
/**
 * @purpose Weak-pattern fallback used when a log has no hard anchor.
 * @param clean ANSI-stripped full log.
 * @param lines ANSI-stripped log lines.
 * @returns Matching diagnostic lines, or a leading excerpt when nothing matches.
 */
function fallback(clean: string, lines: string[]): string {
  const matched = lines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.length > 200 && !/:\d+/.test(t) && !FALLBACK_PATTERNS.some((p) => p.test(t)))
      return false;
    return FALLBACK_PATTERNS.some((p) => p.test(t));
  });

  if (matched.length === 0) return clean.slice(0, 2000) + '\n... [no error lines]';
  return matched.join('\n');
}
// #endregion END_FALLBACK

/**
 * @purpose Optional narrowing of {@link filterLog} output.
 * @consumer vcs-job-log, vcs-pipeline
 */
export type LogFilterOptions = {
  /** @purpose Keep only failure blocks whose heading line contains this substring (case-insensitive). */
  test?: string;
};

/**
 * @purpose Filter a raw CI log: strip ANSI and extract complete error blocks (anchor + context).
 * @invariant Bare `Error:`/`cause:` lines are kept only inside a block opened by a real
 *   failure marker, preserving noise suppression.
 * @invariant Each anchor absorbs up to {@link MAX_BLOCK_LINES} forward context lines; blocks
 *   are merged when adjacent and elisions are marked with `… (N lines skipped)`.
 * @invariant With `test`, only blocks whose heading contains the substring survive; no match
 *   yields a single explanatory line instead of the weak-pattern fallback.
 * @param rawLog Raw job trace from the GitLab API.
 * @param [options] Optional narrowing options.
 * @returns Filtered log: every detected failure with its assertion diff, code frame and stack.
 * @sideEffect None — pure function.
 */
export function filterLog(rawLog: string, options: LogFilterOptions = {}): string {
  const clean = normalizeRawLog(rawLog);
  const lines = clean.split('\n');
  const test = options.test?.trim().toLowerCase();
  const anchors = lines.map(
    (line) => isAnchor(line) && (!test || line.toLowerCase().includes(test))
  );

  if (!anchors.some(Boolean)) {
    if (test) return `(no failing block matching "${options.test}")`;
    return fallback(clean, lines);
  }

  const included = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (!anchors[i]) continue;
    included.add(i);

    let grown = 0;
    for (let j = i + 1; j < lines.length && grown < MAX_BLOCK_LINES; j++, grown++) {
      if (lines[j].trim() === '') {
        included.add(j);
        continue;
      }
      if (anchors[j] || isContext(lines[j])) {
        included.add(j);
        continue;
      }
      break;
    }
  }

  return renderIncluded(lines, included);
}
