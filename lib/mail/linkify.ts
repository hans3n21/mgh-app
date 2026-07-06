// Matches either Markdown-style [label](url) or a bare http(s)/www. URL.
// A single combined pattern processed in one .replace() pass avoids the
// double-linkify corruption that occurs when a bare-URL pass and a
// markdown-link pass each rewrite text the other already turned into an <a>.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function stripTrailingPunctuation(url: string): { core: string; trailing: string } {
	const match = url.match(/[.,;:!?)]+$/);
	if (!match) return { core: url, trailing: '' };
	return { core: url.slice(0, -match[0].length), trailing: match[0] };
}

/**
 * Converts a plain-text message body (as typed in the reply textarea) into a
 * safe HTML fragment for outgoing emails: escapes HTML special chars first
 * (so pasted text can never inject markup), then turns Markdown-style
 * [label](url) links and bare http(s)/www. URLs into real, clickable <a>
 * tags, and finally maps newlines to <br>.
 */
export function textToSafeHtml(text: string): string {
	const escaped = escapeHtml(text);
	const linked = escaped.replace(LINK_PATTERN, (_match, mdLabel, mdUrl, bareUrl) => {
		if (mdUrl) {
			return `<a href="${mdUrl}" target="_blank" rel="noopener noreferrer nofollow">${mdLabel}</a>`;
		}
		const { core, trailing } = stripTrailingPunctuation(bareUrl);
		const href = core.toLowerCase().startsWith('www.') ? `https://${core}` : core;
		return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${core}</a>${trailing}`;
	});
	return linked.replace(/\n/g, '<br>');
}
