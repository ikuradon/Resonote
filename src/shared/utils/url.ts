/**
 * Validate and sanitize an image URL. Returns the URL if safe, undefined otherwise.
 * Only allows http: and https: protocols.
 */
export function sanitizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
