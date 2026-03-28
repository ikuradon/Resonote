import type { ContentId } from '$shared/content/types.js';

import type { ContentMetadata } from '../domain/content-metadata.js';

/** Platforms that have server-side oEmbed/metadata endpoints */
const OEMBED_PLATFORMS = new Set([
  'spotify',
  'youtube',
  'soundcloud',
  'vimeo',
  'mixcloud',
  'spreaker',
  'podbean',
  'niconico'
]);

/** Platforms whose metadata comes from existing resolution (not oEmbed) */
const SELF_RESOLVED_PLATFORMS = new Set(['podcast', 'audio']);

export async function fetchContentMetadata(contentId: ContentId): Promise<ContentMetadata | null> {
  if (SELF_RESOLVED_PLATFORMS.has(contentId.platform)) return null;
  if (!OEMBED_PLATFORMS.has(contentId.platform)) return null;

  try {
    const params = new URLSearchParams({
      platform: contentId.platform,
      type: contentId.type,
      id: contentId.id
    });
    const res = await fetch(`/api/oembed/resolve?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title: string | null;
      subtitle: string | null;
      thumbnailUrl: string | null;
      description: string | null;
    };

    return {
      title: data.title,
      subtitle: data.subtitle,
      thumbnailUrl: data.thumbnailUrl,
      description: data.description ?? null
    };
  } catch {
    return null;
  }
}
