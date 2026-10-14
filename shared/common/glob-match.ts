// @file: Shared deterministic glob-to-regex conversion for repository path policy.
// @spec: SHARED
// @consumers: LintCommand, Node target Verify adapter

/**
 * @purpose Convert the repository's bounded glob dialect into an anchored path matcher.
 * @param pattern Glob pattern using `**`, `*`, `?`, or a character class.
 * @returns Anchored regular expression over slash-normalized repository paths.
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    const next = pattern[i + 1];

    if (ch === '*' && next === '*') {
      if (pattern[i + 2] === '/') {
        regexStr += '(?:.*\\/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (ch === '*') {
      regexStr += '[^/]*';
      i += 1;
    } else if (ch === '?') {
      regexStr += '[^/]';
      i += 1;
    } else if (ch === '.') {
      regexStr += '\\.';
      i += 1;
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i);
      if (close !== -1) {
        regexStr += pattern.slice(i, close + 1);
        i = close + 1;
      } else {
        regexStr += '\\[';
        i += 1;
      }
    } else {
      regexStr += escapeRegex(ch);
      i += 1;
    }
  }

  return new RegExp(`^${regexStr}$`);
}

/**
 * @purpose Test one path against any pattern in the shared repository glob dialect.
 * @param filePath Slash-normalized repository-relative path.
 * @param patterns Glob patterns to test when no compiled projection is supplied.
 * @param [compiled] Precompiled patterns for repeated matching.
 * @returns Whether at least one pattern matches the complete path.
 */
export function matchesAnyGlob(
  filePath: string,
  patterns: readonly string[],
  compiled?: readonly RegExp[]
): boolean {
  const regexes = compiled ?? patterns.map(globToRegex);
  return regexes.some((regex) => regex.test(filePath));
}

function escapeRegex(ch: string): string {
  const special = '^$\\+*.?{}[]()|/';
  return special.includes(ch) ? `\\${ch}` : ch;
}
