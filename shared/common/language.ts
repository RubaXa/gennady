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
 * @purpose Определить язык программирования по расширению файла.
 * @consumer review-gen, cat-gen
 * @param ext Расширение без точки (например 'ts', 'js').
 * @returns Человекочитаемое имя языка или undefined, если расширение неизвестно.
 */
export const getProgrammingLanguage = (ext: string): string | undefined => {
  return languages[ext] ?? undefined;
};

/**
 * @purpose Получить системный язык пользователя (locale) для локализации вывода.
 * @consumer ai-legacy, prompts
 * @sideEffect Process: вызов osascript для чтения system info.
 * @returns Код языка (например 'ru', 'en') или 'en' при ошибке.
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
