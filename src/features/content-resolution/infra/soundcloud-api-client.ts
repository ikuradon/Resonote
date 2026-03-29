/**
 * SoundCloud oEmbed API client.
 * Encapsulates the direct oEmbed lookup and iframe src extraction.
 */

export interface SoundCloudOEmbedResult {
  html?: string;
}

export async function resolveSoundCloudEmbed(trackUrl: string): Promise<string> {
  if (!trackUrl.startsWith('https://soundcloud.com/')) {
    throw new Error('Invalid SoundCloud URL');
  }

  const res = await fetch(
    `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trackUrl)}`
  );
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);

  const data = (await res.json()) as SoundCloudOEmbedResult;
  const match = data.html?.match(/src="([^"]+)"/);
  if (match?.[1]) return match[1];

  throw new Error('No iframe src in oEmbed response');
}
