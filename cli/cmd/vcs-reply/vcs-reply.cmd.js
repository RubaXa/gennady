#!/usr/bin/env node
import fs from 'node:fs';
import { getGitRemote } from '../../../src/git/git-core.js';
import { VcsGitlabClient } from '../../../src/vcs-client/gitlab/vcs-gitlab-client.js';
import { parseArgs } from '../../../src/utils/parse-args.js';
import { style } from '../../../src/utils/style.js';

export async function main(opts = {}) {
	const project = opts.project;
	const iid = opts.iid;
	const dryRun = !!opts.dryRun;
	const stdinJsonArray = opts.stdinJsonArray;

	if (!project) {
		console.error(style.redBright.bold('✖ Ошибка:'), 'Не указан --project.');
		return { ok: false, sent: 0, failed: 0, code: 1 };
	}
	if (!iid) {
		console.error(style.redBright.bold('✖ Ошибка:'), 'Не указан --iid.');
		return { ok: false, sent: 0, failed: 0, code: 1 };
	}

	let payload = stdinJsonArray;
	if (!payload) {
		let raw = '';
		if (!process.stdin.isTTY) {
			raw = fs.readFileSync(0, 'utf8');
		}
		if (!raw || !raw.trim()) {
			console.error(style.redBright.bold('✖ Ошибка:'), 'Пустой stdin. Ожидается JSON-массив.');
			console.error(style.gray('Пример:'));
			console.error(style.gray(`  [{"discussionId":"DISC_001","body":"Текст"}]`));
			return { ok: false, sent: 0, failed: 0, code: 1 };
		}
		try {
			payload = JSON.parse(raw);
		} catch (e) {
			console.error(style.redBright.bold('✖ Ошибка:'), `Некорректный JSON: ${e.message || String(e)}`);
			return { ok: false, sent: 0, failed: 0, code: 1 };
		}
	}

	if (!Array.isArray(payload) || payload.length === 0) {
		console.error(style.redBright.bold('✖ Ошибка:'), 'Ожидается непустой JSON-массив объектов.');
		return { ok: false, sent: 0, failed: 0, code: 1 };
	}

	const items = payload.filter(
		(x) => x && typeof x.discussionId === 'string' && x.discussionId && typeof x.body === 'string' && x.body,
	);

	if (items.length === 0) {
		console.error(style.redBright.bold('✖ Ошибка:'), 'Нет валидных элементов для отправки.');
		return { ok: false, sent: 0, failed: 0, code: 1 };
	}

	const token = opts.token || process.env.GITLAB_PERSONAL_TOKEN;
	const remote = opts.remote || getGitRemote();
	let vcs = null;
	let hostInfo = '';
	if (!dryRun) {
		if (!token) {
			console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден токен доступа GitLab.');
			console.error('  Установите переменную окружения:');
			console.error(style.cyan('  export GITLAB_PERSONAL_TOKEN="your_token_here"'));
			return { ok: false, sent: 0, failed: 0, code: 1 };
		}
		if (!remote) {
			console.error(style.redBright.bold('✖ Ошибка:'), 'Не найден удалённый репозиторий origin.');
			return { ok: false, sent: 0, failed: 0, code: 1 };
		}
		if (!/gitlab/i.test(remote.host)) {
			console.error(style.redBright.bold('✖ Ошибка:'), `Провайдер "${style.blue(remote.host)}" пока не поддерживается.`);
			return { ok: false, sent: 0, failed: 0, code: 1 };
		}
		const apiPath = process.env.GITLAB_API_PATH || '/api/v4';
		const baseUrl = opts.baseUrl || `https://${remote.host}${apiPath}`;
		vcs = opts.vcs || new VcsGitlabClient({ token, baseUrl });
		hostInfo = remote.host;
	} else {
		hostInfo = remote?.host || '';
	}

	console.info(
		'🤖',
		style.whiteBright.bold('GENNADY'),
		style.gray('→'),
		style.yellow('vcs-reply'),
	);
	console.info(style.gray(`-`.repeat(40)));
	console.info(`- project: ${style.cyan(project)}`);
	console.info(`- iid: ${style.cyan(String(iid))}`);
	if (hostInfo) console.info(`- host: ${style.cyan(hostInfo)}`);
	console.info(`- mode: ${dryRun ? style.yellow('dry-run') : style.green('live')}`);
	console.info(style.gray(`-`.repeat(40)));

	let sent = 0;
	let failed = 0;

	if (dryRun) {
		for (const it of items) {
			console.info(`${style.blue('[DRY]')} ${style.gray(it.discussionId)} → ${it.body.slice(0, 80)}`);
			sent += 1;
		}
		return { ok: true, sent, failed, code: 0 };
	}

	for (const it of items) {
		try {
			await vcs.MergeDiscussions.addNote({
				project,
				iid,
				discussionId: it.discussionId,
				body: it.body,
			});
			console.info(`${style.green('✔')} ${style.gray(it.discussionId)}`);
			sent += 1;
		} catch (e) {
			console.error(`${style.redBright('✖')} ${style.gray(it.discussionId)} ${e.message || String(e)}`);
			failed += 1;
		}
	}

	const ok = failed === 0;
	console.info(style.gray(`-`.repeat(40)));
	console.info(`- sent: ${style.green(String(sent))}`);
	console.info(`- failed: ${failed ? style.redBright(String(failed)) : style.green('0')}`);
	return { ok, sent, failed, code: ok ? 0 : 1 };
}

const args = parseArgs(process.argv, {
	project: ['project'],
	iid: ['iid'],
	'dry-run': ['dry-run', 'dry'],
});

const run = await main({
	project: args.project,
	iid: args.iid,
	dryRun: !!args['dry-run'],
});

process.exit(run.code);
