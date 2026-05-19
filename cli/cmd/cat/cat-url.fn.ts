// @file: Resolve cat --url: parse URL → VCS client → fetch ALL changed files → CatGenResult[].
// @consumers: cli/cmd/cat/cat.cmd.ts
// @tasks: TSK-31

import { parseVcsUrl } from '../../../services/vcs-client/parse-vcs-url.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import { logger } from '../../../shared/common/logger.ts';
import type { VcsMergeRequestChanges } from '../../../services/vcs-client/entities/vcs-merge-request-changes.type.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { CatGenResult } from '../../utils/cat-gen/cat-gen.ts';

export type CatUrlResult = { ok: true; files: CatGenResult[] } | { ok: false; error: string };

export async function resolveCatUrl(
  url: string,
  options: { exclude?: string | string[]; extensions?: string[] } = {}
): Promise<CatUrlResult> {
  const parsed = parseVcsUrl(url);
  if (!parsed) {
    return {
      ok: false,
      error: `Не удалось распознать URL: ${url}. Ожидается GitLab MR или GitHub PR.`,
    };
  }

  let token: string;
  let baseUrl: string;

  if (parsed.provider === 'gitlab') {
    token = process.env.GITLAB_PERSONAL_TOKEN ?? '';
    if (!token) return { ok: false, error: 'GITLAB_PERSONAL_TOKEN не установлен.' };
    baseUrl = `https://${parsed.host}${process.env.GITLAB_API_PATH ?? '/api/v4'}`;
  } else {
    token = process.env.GITHUB_PERSONAL_TOKEN ?? '';
    if (!token) return { ok: false, error: 'GITHUB_PERSONAL_TOKEN не установлен.' };
    baseUrl =
      parsed.host === 'github.com' ? 'https://api.github.com' : `https://${parsed.host}/api/v3`;
  }

  logger.info(
    `[cat --url] provider=${parsed.provider} repo=${parsed.repository} iid=${parsed.iid}`
  );

  const client: VcsClient =
    parsed.provider === 'gitlab'
      ? new VcsGitlabClient({ baseUrl, token })
      : new VcsGithubClient({ baseUrl, token });

  let changes: VcsMergeRequestChanges[];
  try {
    changes = await client.MergeRequests.getChanges({
      repository: parsed.repository,
      iid: parsed.iid,
    });
  } catch (cause) {
    return {
      ok: false,
      error: `Ошибка получения изменений: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  if (changes.length === 0) {
    return { ok: false, error: 'MR/PR не содержит изменённых файлов.' };
  }

  let filtered = changes.filter((c) => c.status !== 'deleted');

  if (options.exclude) {
    const patterns = Array.isArray(options.exclude) ? options.exclude : [options.exclude];
    filtered = filtered.filter((c) => !patterns.some((p) => c.path.includes(p.replace(/\*/g, ''))));
  }

  if (options.extensions && options.extensions.length > 0) {
    const extSet = new Set(options.extensions.map((e) => e.toLowerCase()));
    filtered = filtered.filter((c) => {
      const ext = c.path.includes('.') ? '.' + (c.path.split('.').pop() ?? '').toLowerCase() : '.';
      return extSet.has(ext);
    });
  }

  if (filtered.length === 0) {
    return { ok: false, error: 'После фильтрации не осталось файлов для вывода.' };
  }

  const sampleRef = filtered.length > 0 ? filtered[0].ref : 'N/A';
  logger.info(`[cat --url] total=${changes.length} filtered=${filtered.length} ref=${sampleRef}`);

  const results: CatGenResult[] = [];
  let skipped = 0;

  for (const c of filtered) {
    let fileContent;
    try {
      fileContent = await client.RepositoryFiles?.getFileContent({
        repository: parsed.repository,
        path: c.path,
        ref: c.ref,
      });
      if (!fileContent) {
        skipped++;
        logger.warn(`[cat --url] skip ${c.path}: 404 (ref=${c.ref}, repo=${parsed.repository})`);
        continue;
      }
      if (fileContent.encoding === 'base64') {
        skipped++;
        logger.warn(`[cat --url] skip ${c.path}: binary`);
        continue;
      }
    } catch (e) {
      skipped++;
      logger.warn(`[cat --url] skip ${c.path}: error: ${(e as Error).message}`);
      continue;
    }

    results.push({
      absPath: `vcs://${parsed.host}/${parsed.repository}/${c.path}?ref=${c.ref}`,
      relativePath: c.path,
      contents: fileContent.content,
    });
  }

  if (skipped > 0) {
    logger.info(`[cat --url] skipped ${skipped} files`);
  }

  return { ok: true, files: results };
}
