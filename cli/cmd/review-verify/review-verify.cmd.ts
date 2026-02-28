#!/usr/bin/env node

import { getGitCurrentBranch, getGitRemote } from '../../../shared/backend/git/git-core.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { style } from '../../../shared/common/style.ts';
import { buildReviewVerifyXml } from './review-verify.xml.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.GITLAB_PERSONAL_TOKEN;
if (!token) {
  console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа GitLab.');
  console.error('  Установите переменную окружения:');
  console.error(style.cyan('  export GITLAB_PERSONAL_TOKEN="your_token_here"'));
  process.exit(1);
}

const remote = getGitRemote();
if (!remote) {
  console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден удалённый репозиторий origin.');
  process.exit(1);
}

if (!/gitlab/i.test(remote.host)) {
  console.error(
    style.redBright.bold('✖ Ошибка:'),
    `Провайдер "${style.blue(remote.host)}" пока не поддерживается.`
  );
  process.exit(1);
}

const apiPath = process.env.GITLAB_API_PATH ?? '/api/v4';
const baseUrl = `https://${remote.host}${apiPath}`;
const vcs = new VcsGitlabClient({ token, baseUrl });

const branch = getGitCurrentBranch();

try {
  const merge = await vcs.MergeRequests.getOne({
    project: remote.project,
    sourceBranch: branch,
    state: 'opened',
  });

  if (!merge) {
    console.info(style.yellow('ℹ Merge Request не найден для ветки:'), style.cyan(branch));
    process.exit(0);
  }

  const mergeObj = merge as {
    iid: number;
    project_id?: number;
    source_branch?: string;
    title?: string;
    web_url?: string;
    author?: { username?: string };
  };
  const discussions = await vcs.MergeDiscussions.getAll({
    iid: mergeObj.iid,
    project: remote.project,
  });

  const reviewArtifactXml = buildReviewVerifyXml(
    mergeObj,
    discussions as Parameters<typeof buildReviewVerifyXml>[1]
  );

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const libDir = path.resolve(__dirname, '../../..');
  const candidates = [
    path.join(process.cwd(), '.ai/agents/agent-review-verifier.xml'),
    path.join(libDir, '.ai/agents/agent-review-verifier.xml'),
  ];
  let template: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      template = await fs.promises.readFile(p, 'utf-8');
      break;
    }
  }
  if (!template) {
    console.error(
      style.redBright.bold('✖ Ошибка:'),
      'Не найден файл шаблона agent-review-verifier.xml в .ai/agents'
    );
    process.exit(1);
  }
  const promptXml = template.replace('<!--Review_Audit_Artifact-->', reviewArtifactXml);
  console.info(promptXml);
  process.exit(0);
} catch (e) {
  console.error(style.redBright.bold('✖ Ошибка GitLab API:'), (e as Error).message ?? String(e));
  process.exit(1);
}
