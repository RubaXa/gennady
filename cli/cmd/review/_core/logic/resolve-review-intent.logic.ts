// @file: Разрешить намерение review-запуска из аргументов (url/ref/project+iid/branch).
// @consumers: run-review-command.logic
// @tasks: N/A

import type { ReviewCommandArgs } from '../types/review-command-args.type.ts';
import type { ReviewIntent } from '../types/review-intent.type.ts';

function parseReviewRef(reviewRef: string): { project: string; iid: string } | null {
  const parts = reviewRef.split('!');
  if (parts.length !== 2) {
    return null;
  }

  const project = parts[0]?.trim();
  const iid = parts[1]?.trim();

  if (!project || !iid) {
    return null;
  }

  return { project, iid };
}

function parseReviewUrl(reviewUrl: string): { host: string; project: string; iid: string } | null {
  try {
    const url = new URL(reviewUrl);
    const match = url.pathname.match(/^(?<project>.+?)\/-\/merge_requests\/(?<iid>\d+)\/?$/);

    if (!match?.groups) {
      return null;
    }

    return {
      host: url.hostname.toLowerCase(),
      project: match.groups.project.replace(/^\/+/, ''),
      iid: match.groups.iid,
    };
  } catch {
    return null;
  }
}

/**
 * @purpose Разрешить намерение review-запуска из аргументов (url/ref/project+iid/branch).
 * @consumer run-review-command.logic
 * @param args Нормализованные аргументы review-команды.
 * @returns ReviewIntent с приоритетом url > ref > project+iid > branch fallback.
 */
export function resolveReviewIntent(args: ReviewCommandArgs): ReviewIntent {
  if (args.url) {
    const parsedUrl = parseReviewUrl(args.url);
    if (!parsedUrl) {
      throw new Error('Некорректный --url. Ожидается ссылка на GitLab MR.');
    }

    return {
      source: 'url',
      host: parsedUrl.host,
      project: parsedUrl.project,
      iid: parsedUrl.iid,
    };
  }

  if (args.ref) {
    const parsedRef = parseReviewRef(args.ref);
    if (!parsedRef) {
      throw new Error('Некорректный --ref. Ожидается формат <PROJECT>!<IID>.');
    }

    return {
      source: 'ref',
      project: parsedRef.project,
      iid: parsedRef.iid,
    };
  }

  if (args.project || args.iid) {
    if (!args.project || !args.iid) {
      throw new Error('Для явного MR укажите оба параметра: --project и --iid.');
    }

    return {
      source: 'project-iid',
      project: args.project,
      iid: args.iid,
    };
  }

  return {
    source: 'branch',
    branch: args.branch,
  };
}
