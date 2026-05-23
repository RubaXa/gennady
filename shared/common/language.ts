// @file: Determine programming language by file extension.
// @consumers: git-diff
// @tasks: N/A

import { execSync as nodeExecSync } from 'node:child_process';

const languages: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  java: 'Java',
  py: 'Python',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  rb: 'Ruby',
  php: 'PHP',
  go: 'Go',
  swift: 'Swift',
  m: 'Objective-C',
  mm: 'Objective-C++',
  kt: 'Kotlin',
  sh: 'Shell',
  bash: 'Shell',
  html: 'HTML',
  css: 'CSS',
  less: 'Less',
  scss: 'SCSS',
  sass: 'Sass',
  md: 'Markdown',
  mdc: 'Markdown',
};

/**
 * @purpose Determine programming language by file extension.
 * @consumer review-gen, cat-gen
 */
export const getProgrammingLanguage = (ext: string): string | undefined => {
  return languages[ext] ?? undefined;
};

/**
 * @purpose Get system user language (locale) for output localization.
 * @sideEffect Process: call osascript to read system info.
 * @consumer ai-legacy, prompts
 */
export const getSysLang = (): string => {
  try {
    const values = nodeExecSync("osascript -e 'user locale of (get system info)'")
      .toString()
      .trim()
      .toLowerCase()
      .split('_');
    const lang = values.filter((v) => v !== 'en' && v !== 'us');
    return lang[0] ?? 'en';
  } catch {
    return 'en';
  }
};
