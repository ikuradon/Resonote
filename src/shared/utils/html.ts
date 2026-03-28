/** Decode common HTML/XML entities. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Convert HTML to Markdown, preserving links, emphasis, and structure.
 * Handles raw HTML, XML-escaped HTML, and CDATA remnants.
 *
 * Supported conversions:
 * - `<a href="url">text</a>` → `[text](url)`
 * - `<strong>`, `<b>` → `**text**`
 * - `<em>`, `<i>` → `*text*`
 * - `<br>` → newline
 * - `<p>`, `<div>` → double newline
 * - `<li>` → `- item`
 * - All other tags stripped
 */
export function htmlToMarkdown(html: string): string {
  // Pass 1: decode XML entities so &lt;p&gt; becomes <p>
  const decoded = decodeEntities(html);

  return (
    decoded
      // Strip CDATA markers
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      // Links: <a href="url">text</a> → [text](url)
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      // Bold: <strong>, <b>
      .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
      // Italic: <em>, <i>
      .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      // List items
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      // Block elements → newlines
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|blockquote|h[1-6])>/gi, '\n\n')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '')
      // Collapse excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Strip all HTML tags and decode entities.
 * Use for plain-text fields (e.g. RSS title) where HTML should not appear.
 */
export function stripHtmlTags(html: string): string {
  // Decode entities first so &lt;script&gt; becomes <script>, then strip all tags
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Unescape HTML entities that were introduced by our own escaping pass. */
function unescapeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Escape text for safe HTML display (but NOT for attributes). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render Markdown to sanitized HTML for display.
 * Only supports: links, bold, italic, newlines.
 * Links are validated to block javascript: URLs.
 */
export function renderMarkdown(md: string): string {
  return (
    md
      // Escape any raw HTML in the markdown text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Links: [text](url) → <a>
      // Unescape &amp; in URL/text since we escaped & above before link conversion
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, rawText: string, rawUrl: string) => {
        const url = unescapeHtmlEntities(rawUrl);
        const text = unescapeHtmlEntities(rawText);
        return isSafeUrl(url)
          ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
          : escapeHtml(text);
      })
      // Bold: **text**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic: *text*
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      // List items: - text
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      // Newlines → <br>
      .replace(/\n/g, '<br>')
  );
}

/** Check if a URL is safe (not javascript:, data:, vbscript:) */
function isSafeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return (
    !lower.startsWith('javascript:') && !lower.startsWith('data:') && !lower.startsWith('vbscript:')
  );
}

/** Escape a string for use in an HTML attribute */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
