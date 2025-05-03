import { execSync as nodeExecSync } from 'node:child_process';
import { parseGitDiff } from './git-diff.js';

const execSync = (cmd) => {
	try {
		return nodeExecSync(cmd, { encoding: 'utf-8'});
	} catch (e) {
		return '';
	}
}
	
export const detectGitBaseBranch = () => {
	const branchesOutput = execSync('git branch --list 2>/dev/null');
	const match = branchesOutput?.match(/\s*\*?\s*(master|main)$/m);
	return match?.[1] || 'master';
}

export const getGitCommitCount = () => {
	try {
		const output = execSync(`git rev-list --count HEAD ^${detectGitBaseBranch()} 2>/dev/null`);
		return parseInt(output, 10) || 0;
	} catch {
		return 0;
	}
}

export const getGitDiff = (targetBranch = undefined) => {
	if (targetBranch) {
		return execSync(`git diff ${targetBranch}`);
	}

	return execSync('git diff --cached');
}

export const getGitDiffInfo = (branch = undefined) => {
	const diff = getGitDiff(branch);
	const parsedDiff = parseGitDiff(diff).sort((a, b) => a.tokens - b.tokens);
	const parsedCodeDiff = parsedDiff.filter(f => !f.isDeleted && !f.isRenamed && f.programmingLanguage);
	const commitCount = getGitCommitCount();

	const parsedCodeTokens = parsedCodeDiff.reduce((sum, file) => sum + file.tokens, 0);
	const parsedCodeMaxTokens = parsedCodeDiff.at(-1)?.tokens || 0;
	const programmingLanguages = [...new Set(parsedCodeDiff.map(f => f.programmingLanguage).filter(Boolean))];

	return {
		diff,
		parsedDiff,
		parsedCodeDiff,
		parsedCodeTokens,
		parsedCodeMaxTokens,
		programmingLanguages,
		commitCount,
	};
}
