import { isListenEpisodeUrl } from '$shared/content/podcast.js';
import { parseContentUrl } from '$shared/content/registry.js';
import { extractTimeParam, toBase64url } from '$shared/content/url-utils.js';

import { resolveListenEpisodeUrl } from './resolve-listen-episode.js';

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

export async function resolveContentNavigation(input: string): Promise<ContentNavigationResult> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalizedInput = normalizeInputUrl(trimmed);
  if (isListenEpisodeUrl(normalizedInput)) {
    const listenResult = await resolveListenEpisodeUrl(normalizedInput);
    if (listenResult) return { path: listenResult.path };
  }

  const contentId =
    parseContentUrl(trimmed) ??
    (trimmed === normalizedInput ? null : parseContentUrl(normalizedInput));
  if (contentId) {
    const timeSec = extractTimeParam(normalizedInput);
    const timeQuery = timeSec > 0 ? `?t=${timeSec}` : '';
    return {
      path: `/${contentId.platform}/${contentId.type}/${encodeURIComponent(contentId.id)}${timeQuery}`
    };
  }

  try {
    new URL(normalizedInput);
  } catch {
    return { errorKey: 'track.unsupported' };
  }

  return {
    path: `/resolve/${toBase64url(normalizedInput)}`
  };
}
