#!/usr/bin/env node
/**
 * @purpose Проверить наличие Merge Request для текущей ветки в GitLab.
 * @consumer CLI
 * @pre Должен быть настроен origin (getGitRemote) и задан токен GITLAB_PERSONAL_TOKEN.
 * @sideEffect Network: Запросы к GitLab API; IO: печать в stdout/stderr, завершение процесса.
 */

import { getGitCurrentBranch, getGitRemote } from '../../../src/git/git-core.js';
import { VcsGitlabClient } from '../../../src/vcs-client/gitlab/vcs-gitlab-client.js';
import { style } from '../../../src/utils/style.js';
import { buildReviewVerifyXml } from './review-verify.xml.js';
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
	console.error(style.redBright.bold('✖ Ошибка:'), `Провайдер "${style.blue(remote.host)}" пока не поддерживается.`);
	process.exit(1);
}

const apiPath = process.env.GITLAB_API_PATH || '/api/v4';
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

	const discussions = await vcs.MergeDiscussions.getAll({
		iid: merge.iid,
		project: remote.project,
	});

	const reviewArtifactXml = buildReviewVerifyXml(merge, discussions);
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const libDir = path.resolve(__dirname, '../../..');
	const candidates = [
		path.join(process.cwd(), '.ai/agents/agent-review-verifier.xml'),
		path.join(libDir, '.ai/agents/agent-review-verifier.xml'),
	];
	let template = null;
	for (const p of candidates) {
		if (fs.existsSync(p)) {
			template = await fs.promises.readFile(p, 'utf-8');
			break;
		}
	}
	if (!template) {
		console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден файл шаблона agent-review-verifier.xml в .ai/agents');
		process.exit(1);
	}
	const promptXml = template.replace('<!--Review_Audit_Artifact-->', reviewArtifactXml);
	console.info(promptXml);
	process.exit(0);

	console.info(`## ${merge.title}\n`);
	console.info(`- iid: ${merge.iid}`);
	console.info(`- project: ${remote.project}`);
	console.info(`- sourceBranch: ${merge.source_branch}`);
	console.info(`- host: ${remote.host}`);
	console.info(`- web_url: ${merge.web_url || ''}`);
	console.info(`\n---\n`);

	console.info(`### Дискуссии\n`);
	let printed = 0;
	for (const thread of discussions) {
		const notes = Array.isArray(thread.notes) ? thread.notes : [];
		const firstNote = notes[0];
		
		if (!firstNote || firstNote.system || firstNote.resolved) {
			continue;
		}

		const pos = firstNote.position || {};
		const path = pos.new_path || pos.old_path || '';
		const line = pos.new_line || pos.old_line || '';
		const locator = path ? `${path}${line ? `#L${line}` : ''}` : '';

		console.info(`#### [${thread.id}] ${locator}\n`);
		for (const note of notes) {
			const author = note.author.username;

			console.info(`##### [${note.id}] ${author}`);
			console.info(note.body);
			console.info('');

			printed += 1;
		}
	}
	if (printed === 0) {
		console.info('Нет нерешённых пользовательских дискуссий.');
	}

	process.exit(0);
} catch (e) {
	console.error(style.redBright.bold('✖ Ошибка GitLab API:'), e.message || String(e));
	process.exit(1);
}
