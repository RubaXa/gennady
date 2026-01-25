const THINK_CLOSE_TAG = '</think>';

export const removeThink = (raw) => {
	const cleaned = String(raw || '').split(THINK_CLOSE_TAG).slice(-1).join(THINK_CLOSE_TAG).trim();
	
	if (/^(Хорошо,|Okay,)/.test(cleaned)) {
		return cleaned.split('\n\n\n').slice(-1).join('\n\n\n').trim();
	}

	return cleaned;
};