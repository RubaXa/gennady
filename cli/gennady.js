#!/usr/bin/env node

const helpFlags = new Set(['help', '--help', '-h']);
const command = process.argv[2];

if (helpFlags.has(command)) {
	console.info('Gennady CLI');
	console.info('');
	console.info('Usage:');
	console.info('  npx gennady [command] [options]');
	console.info('');
	console.info('Commands:');
	console.info('  commit (default)  Generate commit message from staged changes');
	console.info('  review            Review staged changes for critical issues');
	console.info('  cat               Display file contents as XML or Markdown');
	console.info('  agent             Run AI agent request');
	console.info('  vcs-reply         Post replies to GitLab MR discussions from stdin');
	console.info('  review-verify     Build verification prompt from open GitLab MR');
	console.info('');
	console.info('Examples:');
	console.info('  npx gennady');
	console.info('  npx gennady review --branch=develop');
	console.info('  npx gennady cat "./src/**/*.js" --output=md');
	process.exit(0);
}

switch(command) {
	case 'agent':
		import('./cmd/agent/index.js');
		break;
	case 'cat':
		import('./cmd/cat/index.js');
		break;
	case 'review':
		import('./cmd/review/index.js');
		break;
	case 'vcs-reply':
		import('./cmd/vcs-reply/index.js');
		break;
	case 'review-verify':
		import('./cmd/review-verify/index.js');
		break;
	default:
		import('./cmd/commit/index.js');
		break;
}
