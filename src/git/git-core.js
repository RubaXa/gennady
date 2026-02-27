import { parseGitDiff } from './git-diff.js';
import { execSyncSafe } from '../utils/exec.js';
import { isTestFile } from '../utils/files.js';
import { logger } from '../utils/logger.js';

/**
 * @purpose Определить базовую ветку репозитория (main или master) для анализа diff.
 * @consumer git-core (getGitDiffInfo, getGitCommitCount)
 * @returns Имя базовой ветки для сравнений (main|master), либо 'master' по умолчанию.
 * @sideEffect Process: выполнение git branch.
 */
export const detectGitBaseBranch = () => {
	const branchesOutput = execSyncSafe('git branch --list 2>/dev/null');
	const match = branchesOutput?.match(/\s*\*?\s*(master|main)$/m);
	return match?.[1] || 'master';
}

/**
 * @purpose Получить имя текущей ветки Git.
 * @consumer CLI (review-verify, vcs-reply), commit-gen
 * @returns Имя текущей ветки; 'HEAD' при отсоединённой голове или ошибке.
 * @sideEffect Process: выполнение git rev-parse.
 */
export const getGitCurrentBranch = () => {
	const branch = execSyncSafe('git rev-parse --abbrev-ref HEAD 2>/dev/null').trim();
	return branch || 'HEAD';
};

/**
 * @purpose Получить сведения об удалённом репозитории origin.
 * @consumer CLI (review-verify, vcs-reply)
 * @returns {host, project, scheme} или null, если origin не настроен/не распознан.
 * @sideEffect Process: выполнение git config / git remote.
 */
export const getGitRemote = () => {
	const remote =
		execSyncSafe('git config --get remote.origin.url 2>/dev/null').trim() ||
		execSyncSafe('git remote get-url origin 2>/dev/null').trim();

	const url = (remote || '').trim();
	if (!url) return null;

	if (/^[a-z]+:\/\//i.test(url)) {
		try {
			const u = new URL(url);
			const host = (u.hostname || '').toLowerCase();
			const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
			const project = (u.pathname || '').replace(/^\/+/, '').replace(/\.git$/i, '');
			if (!host || !project) return null;
			return { host, project, scheme };
		} catch (cause) {
			logger.debug(`[getGitRemote] [parsing -> skip] URL parse failed`, { cause });
		}
	}

	const scp = url.match(/^[\w.-]+@([^:\/]+)[:\/](.+)$/);
	if (scp) {
		const host = (scp[1] || '').toLowerCase();
		const project = (scp[2] || '').replace(/^\/+/, '').replace(/\.git$/i, '');
		const scheme = 'ssh';
		if (!host || !project) return null;
		return { host, project, scheme };
	}

	return null;
};

/**
 * @purpose Посчитать количество коммитов поверх базовой ветки.
 * @consumer git-core (getGitDiffInfo)
 * @returns Ненулевое целое число коммитов поверх базовой ветки; 0 при ошибке/отсутствии данных.
 * @sideEffect Process: выполнение git rev-list.
 */
export const getGitCommitCount = () => {
	try {
		const output = execSyncSafe(`git rev-list --count HEAD ^${detectGitBaseBranch()} 2>/dev/null`);
		return parseInt(output, 10) || 0;
	} catch (cause) {
		logger.debug(`[getGitCommitCount] [counting -> fallback] Using 0`, { cause });
		return 0;
	}
}

/**
 * @purpose Получить текстовый diff текущего состояния относительно цели.
 * @consumer git-core (getGitDiffInfo)
 * @param [targetBranch] Ветка или ревизия, относительно которой строится diff; если не указана — используется HEAD.
 * @returns Строка с текстовым представлением diff из git.
 * @sideEffect Process: выполнение git diff.
 */
export const getGitDiff = (targetBranch = undefined) => {
	if (targetBranch) {
		return execSyncSafe(`git diff ${targetBranch}`);
	}

	return execSyncSafe('git diff HEAD');
}

/**
 * @purpose Построить агрегированную информацию по diff для дальнейшего анализа/ранжирования.
 * @consumer commit-gen, review-gen
 * @param [branch] Целевая ветка/ревизия для сравнения; если не указана — сравнение с HEAD.
 * @returns Объект с исходным diff, разобранными файлами и метриками (языки, токены, коммиты).
 * @sideEffect Process: вызовы getGitDiff и getGitCommitCount (git команды).
 */
export const getGitDiffInfo = (branch = undefined) => {
	const diff = getGitDiff(branch);
	const parsedDiff = parseGitDiff(diff).sort((a, b) => a.tokens - b.tokens);
	const parsedCodeDiff = parsedDiff.filter(f => (
		!f.isDeleted &&
		!f.isRenamed &&
		!isTestFile(f.filename) &&
		(
			f.category === 'config' ||
			f.programmingLanguage
		)
	));
	
	// Если ничего нет, то подмешиваем документацию
	if (!parsedCodeDiff.length) {
		parsedCodeDiff.push(
			...parsedDiff.filter(f => !f.isDeleted && !f.isRenamed && (f.category === 'doc' || isTestFile(f.filename)))
		);
	}

	const parsedCodeTokens = parsedCodeDiff.reduce((sum, file) => sum + file.tokens, 0);
	const parsedCodeChunkMaxTokens = parsedCodeDiff.at(-1)?.tokens || 0;

	const programmingLanguages = [...new Set(parsedCodeDiff.map(f => f.programmingLanguage).filter(Boolean))];

	return {
		diff,
		parsedDiff,
		parsedCodeDiff,
		parsedCodeTokens,
		parsedCodeChunkMaxTokens,
		programmingLanguages,
		commitCount: getGitCommitCount(),
	};
}
