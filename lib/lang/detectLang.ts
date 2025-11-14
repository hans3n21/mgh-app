export function detectLang(text: string): 'DE' | 'EN' {
	const t = (text || '').toLowerCase();
	// simple umlaut/keyword detection
	if (/[äöüß]|\b(hallo|angebot|gültig|beste grüße|preis)\b/.test(t)) return 'DE';
	if (/\b(hello|hi|quote|best regards|valid)\b/.test(t)) return 'EN';
	// fallback: heuristic by letters
	return /[äöüß]/.test(t) ? 'DE' : 'EN';
}


