// @file: Universal log filter — strips ANSI, keeps structural error lines, skips minified code.
// @consumers: vcs-job-log, vcs-pipeline
// @tasks: TSK-85

/** @purpose ANSI escape sequence regex. */
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

/** @purpose Structural patterns for error/test-runner/linter output across all tools. */
const PATTERNS: RegExp[] = [
  /^\s*(✖|❌|⚠|🛑|× |✗ |FAIL |●|▶|✓)/,
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
  /^\s*(not\s+)?ok\s+\d+/i,
];

/**
 * @purpose Filter raw CI log: strip ANSI, keep structural error/warning/test lines, drop minified-code noise.
 * @param rawLog Raw job trace from GitLab API.
 * @returns Filtered log string with only diagnostic-relevant lines.
 */
export function filterLog(rawLog: string): string {
  const clean = rawLog.replace(ANSI_RE, '');

  const lines = clean.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    // Drop minified JS: very long lines without error markers
    if (t.length > 200 && !/:\d+/.test(t) && !PATTERNS.some((p) => p.test(t))) return false;
    return PATTERNS.some((p) => p.test(t));
  });

  if (lines.length === 0) return clean.slice(0, 2000) + '\n... [no error lines]';
  return lines.join('\n');
}
