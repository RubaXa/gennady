const ansiCodes = {
	// Modifiers
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',
	overline: '\x1b[53m',
	inverse: '\x1b[7m',
	hidden: '\x1b[8m',
	strikethrough: '\x1b[9m',

	// Colors (foreground)
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	gray: '\x1b[90m',
	redBright: '\x1b[91m',
	greenBright: '\x1b[92m',
	yellowBright: '\x1b[93m',
	blueBright: '\x1b[94m',
	magentaBright: '\x1b[95m',
	cyanBright: '\x1b[96m',
	whiteBright: '\x1b[97m',
	
	// Background colors
	bgBlack: '\x1b[40m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m',
	bgBlue: '\x1b[44m',
	bgMagenta: '\x1b[45m',
	bgCyan: '\x1b[46m',
	bgWhite: '\x1b[47m',
	bgGray: '\x1b[100m',
	bgRedBright: '\x1b[101m',
	bgGreenBright: '\x1b[102m',
	bgYellowBright: '\x1b[103m',
	bgBlueBright: '\x1b[104m',
	bgMagentaBright: '\x1b[105m',
	bgCyanBright: '\x1b[106m',
	bgWhiteBright: '\x1b[107m'
};

function createStyler(appliedStyles = []) {
	return new Proxy(() => {}, {
		get(_target, prop) {
			if (prop === 'toString') {
				return () => appliedStyles.join('') + '%s' + ansiCodes.reset;
			}

			if (prop in ansiCodes) {
				return createStyler([...appliedStyles, ansiCodes[prop]]);
			}

			return undefined;
		},

		apply(_target, _thisArg, args) {
			const text = args[0] || '';
			return appliedStyles.join('') + text + ansiCodes.reset;
		}
	});
}

export const style = createStyler();
