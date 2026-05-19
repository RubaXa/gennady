// @file: Pure function — parse GitLab MR / GitHub PR URL → VcsUrl.
// @consumers: cat --url, CLI commands
// @tasks: TSK-27

import type { VcsUrl } from './entities/vcs-url.type.ts';

/**
 * @purpose Разбор URL GitLab Merge Request или GitHub Pull Request.
 * @param url Входной URL-строка (может быть null/undefined).
 * @returns VcsUrl при успешном парсинге, null если URL не является MR/PR.
 */
export const parseVcsUrl = (url: string | null | undefined): VcsUrl | null => {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return null;
  }

  const trimmed = url.trim();

  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    return null;
  }

  const host = urlObj.host;
  const pathname = urlObj.pathname.replace(/\/$/, '');

  const gitlabMatch = pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)$/);
  if (gitlabMatch) {
    const iid = parseInt(gitlabMatch[2], 10);
    if (isNaN(iid)) return null;
    return {
      provider: 'gitlab',
      host,
      repository: gitlabMatch[1],
      iid,
    };
  }

  const githubMatch = pathname.match(/^\/(.+?)\/pull\/(\d+)$/);
  if (githubMatch) {
    const iid = parseInt(githubMatch[2], 10);
    if (isNaN(iid)) return null;
    return {
      provider: 'github',
      host,
      repository: githubMatch[1],
      iid,
    };
  }

  return null;
};
