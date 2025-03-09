import { execSync as nodeExecSync } from 'node:child_process';

const languages = {
	js: 'JavaScript',
	jsx: 'JavaScript',
	ts: 'TypeScript',
	tsx: 'TypeScript',
	java: 'Java',
	py: 'Python',
	c: 'C',
	cpp: 'C++',
	cs: 'C#',
	rb: 'Ruby',
	php: 'PHP',
	go: 'Go',
	swift: 'Swift',
	m: 'Objective-C',
	mm: 'Objective-C++',
	kt: 'Kotlin',
	html: 'HTML',
	css: 'CSS',
	less: 'Less',
	scss: 'SCSS',
	sass: 'Sass'
};

export const getProgrammingLanguage = (ext) => {
	return languages[ext] || undefined;
};

export const getSysLang = () => {
	try {
		const values = nodeExecSync("osascript -e 'user locale of (get system info)'").toString().trim().toLowerCase().split('_');
		const lang = values.filter(v => v !== 'en' && v !== 'us');
		return lang[0] || 'en';
	} catch {
		return 'en';
	}
};