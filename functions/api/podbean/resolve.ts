import { assertSafeUrl } from '../../lib/url-validation.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return json({ error: 'missing_url' }, 400);
  }

  try {
    assertSafeUrl(targetUrl);
  } catch {
    return json({ error: 'url_blocked' }, 400);
  }

  // Use Podbean oEmbed API to get the embed iframe URL
  const oembedUrl = `https://api.podbean.com/v1/oembed?format=json&url=${encodeURIComponent(targetUrl)}`;
  try {
    const res = await fetch(oembedUrl);
    if (!res.ok) {
      return json({ error: 'oembed_failed', status: res.status }, 502);
    }
    const data = (await res.json()) as { html?: string };
    const srcMatch = data.html?.match(/src="([^"]+)"/);
    if (srcMatch?.[1]) {
      return json({ embedSrc: srcMatch[1] });
    }

    // Fallback: fetch page HTML and extract embed ID
    const pageRes = await fetch(targetUrl);
    if (pageRes.ok) {
      const html = await pageRes.text();
      const idMatch = html.match(/pb-[a-z0-9]+-[a-z0-9]+/);
      if (idMatch) {
        return json({ embedId: idMatch[0] });
      }
    }

    return json({ error: 'embed_not_found' }, 404);
  } catch {
    return json({ error: 'fetch_failed' }, 502);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
