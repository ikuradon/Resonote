import { parseContentUrl } from '$shared/content/registry.js';
import { extractTimeParam, toBase64url } from '$shared/content/url-utils.js';

export interface ContentNavigationPath {
  path: string;
}

export interface ContentNavigationError {
  errorKey: 'track.unsupported';
}

export type ContentNavigationResult = ContentNavigationError | ContentNavigationPath | null;

function normalizeInputUrl(input: string): string {
  return input.startsWith('http') ? input : `https://${input}`;
}

export function resolveContentNavigation(input: string): ContentNavigationResult {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const contentId = parseContentUrl(trimmed);
  if (contentId) {
    const timeSec = extractTimeParam(trimmed);
    const timeQuery = timeSec > 0 ? `?t=${timeSec}` : '';
    return {
      path: `/${contentId.platform}/${contentId.type}/${encodeURIComponent(contentId.id)}${timeQuery}`
    };
  }

  const normalizedUrl = normalizeInputUrl(trimmed);
  try {
    new URL(normalizedUrl);
  } catch {
    return { errorKey: 'track.unsupported' };
  }

  return {
    path: `/resolve/${toBase64url(normalizedUrl)}`
  };
}
