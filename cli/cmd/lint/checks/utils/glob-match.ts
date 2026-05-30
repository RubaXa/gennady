// @file: Glob-to-regex conversion for --exclude file filtering.
// @consumers: LintCommand

/**
 * @purpose Converts a glob pattern to a RegExp for matching file paths.
 *         Supports: ** (any depth), * (single segment), ? (single char), [abc] (char class).
 * @param pattern Glob pattern string.
 * @returns RegExp that matches paths against the pattern.
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    const next = pattern[i + 1];

    if (ch === '*' && next === '*') {
      // ** matches zero or more path segments
      if (pattern[i + 2] === '/') {
        regexStr += '(?:.*\\/)?';
        i += 3;
      } else if (i + 2 >= pattern.length) {
        regexStr += '.*';
        i += 2;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (ch === '*') {
      regexStr += '[^/]*';
      i++;
    } else if (ch === '?') {
      regexStr += '[^/]';
      i++;
    } else if (ch === '.') {
      regexStr += '\\.';
      i++;
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i);
      if (close !== -1) {
        regexStr += pattern.slice(i, close + 1);
        i = close + 1;
      } else {
        regexStr += '\\[';
        i++;
      }
    } else {
      regexStr += escapeRegex(ch);
      i++;
    }
  }

  return new RegExp('^' + regexStr + '$');
}

/**
 * @purpose Checks whether a file path matches any of the given glob patterns.
 * @param filePath Relative file path to check.
 * @param patterns Array of glob patterns (already compiled or string).
 * @param [compiled] Optional pre-compiled regexes for performance.
 * @returns True if the path matches any pattern.
 */
export function matchesAnyGlob(filePath: string, patterns: string[], compiled?: RegExp[]): boolean {
  const regexes = compiled ?? patterns.map(globToRegex);
  return regexes.some((re) => re.test(filePath));
}

function escapeRegex(ch: string): string {
  const special = '^$\\+*.?{}[]()|/';
  return special.includes(ch) ? '\\' + ch : ch;
}
