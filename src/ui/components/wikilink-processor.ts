/**
 * Processes wikilinks in content and converts them to HTML anchor tags
 * with special data attributes for proper Obsidian integration.
 * 
 * This function converts:
 * - [[Note Name]] -> <a href="Note%20Name" data-wikilink="Note Name" class="internal-link">Note Name</a>
 * - [[Note Name|Display]] -> <a href="Note%20Name" data-wikilink="Note Name" class="internal-link">Display</a>
 * 
 * The resulting anchor tags can be handled by click/hover event listeners
 * to integrate with Obsidian's native link handling system.
 */
export function processWikilinksForHTML(content: string): string {
	return content.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, linkText, _, displayText) => {
		const display = displayText || linkText;
		const encodedLinkText = encodeURIComponent(linkText);
		return `<a href="${encodedLinkText}" data-wikilink="${linkText}" class="internal-link">${display}</a>`;
	});
}

/**
 * Determines if a link href is an internal link (not external URL)
 */
export function isInternalLink(href: string): boolean {
	return !href.match(/^(https?:|mailto:|ftp:|tel:)/i);
}

/**
 * Cleans and normalizes link text for use with Obsidian's openLinkText API
 */
export function cleanLinkText(href: string): string {
	let linkText = decodeURIComponent(href).replace(/\.md$/, "");
	linkText = linkText.replace(/^\.\//, "");
	return linkText;
}
