export const countTokens = (text) => {
	const tokens = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu);
	return tokens ? tokens.length : 0;
}