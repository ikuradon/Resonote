/**
 * Podbean oEmbed API client.
 * Encapsulates the /api/podbean/resolve proxy call.
 */

import { apiClient } from '$shared/api/client.js';

export interface PodbeanResolveResult {
  embedSrc?: string;
  embedId?: string;
}

export async function resolvePodbeanEmbed(sourceUrl: string): Promise<string> {
  const res = await apiClient.api.podbean.resolve.$get({ query: { url: sourceUrl } });
  if (!res.ok) throw new Error(`resolve ${res.status}`);
  const data = (await res.json()) as PodbeanResolveResult;
  if (data.embedSrc) return data.embedSrc;
  if (data.embedId) return `https://www.podbean.com/player-v2/?i=${data.embedId}`;
  throw new Error('No embed URL resolved');
}
