import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ReviewGen } from './review-gen.js';

describe('review', async () => {
	const reviewGen = new ReviewGen();
	const fixtures = getFixture();

	fixtures.forEach(({ name, diff, expected }) => {
		test(name, async () => {
			const result = (await reviewGen.generate(diff)).trim();

			if (expected.includes('OK')) {
				assert.strictEqual(result, 'OK', `Test '${name}': Expected 'OK', got: '${result}'`);
				return;
			}

			if (!expected || expected.length === 0) {
				assert.fail(`Test '${name}': Invalid or empty 'expected' rules.`);
			}

			expected.forEach(ruleString => {
				const suggestion = result.match(/suggestion\n([\s\S]+)/)?.[1] || ''
				const rule = createRule(ruleString);
				const expectationText = rule.isNegation ? 'SHOULD NOT match' : 'SHOULD match';
				const matchResult = rule.regexp.test(suggestion);

				assert.strictEqual(
					matchResult,
					!rule.isNegation,
					`Test '${name}': Output ${expectationText} ${rule.regexp}.\nOutput: '${suggestion}'`
				);
			});
		});
	});
});

function createRule(ruleString) {
	const isNegation = ruleString.startsWith('!');
	const pattern = isNegation ? ruleString.slice(1) : ruleString;
	const regexp = new RegExp(pattern.replace(/^\/|\/$/g, ''));
	return { regexp, isNegation, pattern };
}

function getFixture() {
	const filePath = join(
		typeof __dirname !== 'string' ? dirname(fileURLToPath(import.meta.url)) : __dirname,
		'__fixture__',
		'review-gen-fixture.md',
	);
	const text = readFileSync(filePath).toString();
	const blocks = text.trim().split('\n----\n').filter(Boolean);
	const results = [];
	const regex = /^### (.*?)\s*\n+#### Diff\s*\n+```diff\s*\n(.*?)\n```\s*\n+#### Expected\s*\n+(.*)/si;

	for (const block of blocks) {
		const match = block.trim().match(regex);
		if (!match) continue;

		const name = match[1].trim();
		const diff = match[2].trim();
		let expectedText = match[3].trim();

		if (expectedText.startsWith('```')) {
			const lines = expectedText.split('\n');
			expectedText = lines.length > 1 ? lines.slice(1, -1).join('\n').trim() : '';
		}

		const expected = expectedText === 'OK'
			? 'OK'
			: expectedText.split('\n').map(r => r.trim().replace(/-\s*/g, '')).filter(Boolean);

		results.push({ name, diff, expected });
	}
	return results;
}
