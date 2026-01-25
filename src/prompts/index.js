import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const PROMPTS_DIR = typeof __dirname !== 'string'
	? dirname(fileURLToPath(import.meta.url)) 
	: __dirname;

export const prompts = {
	agent: (name) => readFileSync(join(PROMPTS_DIR, `agent`, `agent-${name}-prompt.md`)).toString(),
	commit: (name) => readFileSync(join(PROMPTS_DIR, `commit`, `commit-${name}-prompt.md`)).toString(),
	review: (name) => readFileSync(join(PROMPTS_DIR, `review`, `review-${name}-prompt.md`)).toString(),
};
