import { apiClient } from '$shared/api/client.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('resolve-yt-feed');

export interface YouTubeFeedVideo {
  videoId: string;
  title: string;
  published: number;
  thumbnail: string;
}

export interface YouTubeFeedResult {
  title: string;
  videos: YouTubeFeedVideo[];
  error?: string;
}

export async function resolveYouTubeFeed(
  type: 'playlist' | 'channel',
  id: string
): Promise<YouTubeFeedResult> {
  try {
    const res = await apiClient.api.youtube.feed.$get({ query: { type, id } });
    if (!res.ok) {
      log.warn('YouTube feed resolve failed', { status: res.status, type, id });
      return { title: '', videos: [], error: 'fetch_failed' };
    }

    const data = (await res.json()) as { title: string; videos: YouTubeFeedVideo[] };
    return { title: data.title, videos: data.videos };
  } catch (err) {
    log.warn('YouTube feed resolve error', { error: err, type, id });
    return { title: '', videos: [], error: 'network_error' };
  }
}
