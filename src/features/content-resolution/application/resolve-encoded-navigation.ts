import { resolveByApi } from '$shared/content/resolution.js';
import { fromBase64url, toBase64url } from '$shared/content/url-utils.js';

export type ResolveEncodedNavigationResult =
  | { path: string }
  | { errorKey: 'resolve.error.not_found' | 'resolve.error.parse_failed' };

export async function resolveEncodedNavigation(
  encodedUrl: string
): Promise<ResolveEncodedNavigationResult> {
  const url = fromBase64url(encodedUrl);
  if (!url) {
    return { errorKey: 'resolve.error.parse_failed' };
  }

  try {
    const data = await resolveByApi(url);

    if (data.error) {
      return {
        errorKey:
          data.error === 'rss_not_found' ? 'resolve.error.not_found' : 'resolve.error.parse_failed'
      };
    }

    if (data.type === 'redirect' && data.feedUrl) {
      return { path: `/podcast/feed/${toBase64url(data.feedUrl)}` };
    }

    return { errorKey: 'resolve.error.parse_failed' };
  } catch {
    return { errorKey: 'resolve.error.parse_failed' };
  }
}
