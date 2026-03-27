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
 * Strip HTML tags and decode entities to produce plain text.
 * Handles both raw HTML and XML-escaped HTML (e.g. `&lt;p&gt;`).
 * Two-pass: decode entities first (handles XML-escaped markup),
 * then strip tags and decode any remaining entities.
 */
export function stripHtml(html: string): string {
  // Pass 1: decode XML entities so &lt;p&gt; becomes <p>
  const decoded = decodeEntities(html);
  // Pass 2: strip CDATA markers, convert block elements, strip tags
  return decoded
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
