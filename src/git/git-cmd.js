import { execSync as nodeExecSync } from 'node:child_process';

const execSync = (cmd) => {
	try {
		return nodeExecSync(cmd, { encoding: 'utf-8'});
	} catch (e) {
		return '';
	}
}
	
const detectBaseBranch = () => {
	const branchesOutput = execSync('git branch --list 2>/dev/null');
	const match = branchesOutput?.match(/\s*\*?\s*(master|main)$/m);
	return match?.[1] || 'master';
}

export const getGitCommitCount = () => {
	try {
		const output = execSync(`git rev-list --count HEAD ^${detectBaseBranch()} 2>/dev/null`);
		return parseInt(output, 10) || 0;
	} catch {
		return 0;
	}
}

export const getGitDiff = (targetBranch) => {
	if (targetBranch) {
		return execSync(`git diff ${targetBranch}`);
	}

	return execSync('git diff --cached');
}
