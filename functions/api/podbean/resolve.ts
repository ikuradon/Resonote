import { assertSafeUrl, safeFetch } from '../../lib/url-validation.js';
import { withSsrfBypass } from '../../lib/with-ssrf-bypass.js';

interface Env {
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

export const onRequestGet: PagesFunction<Env> = withSsrfBypass(handleRequest);

async function handleRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
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
    const res = await safeFetch(oembedUrl);
    if (!res.ok) {
      return json({ error: 'oembed_failed', status: res.status }, 502);
    }
    const data = (await res.json()) as { html?: string };
    const srcMatch = data.html?.match(/src="([^"]+)"/);
    if (srcMatch?.[1]) {
      try {
        assertSafeUrl(srcMatch[1]);
        const embedHost = new URL(srcMatch[1]).hostname;
        if (embedHost === 'podbean.com' || embedHost.endsWith('.podbean.com')) {
          return json({ embedSrc: srcMatch[1] });
        }
      } catch (err) {
        console.warn('[podbean/resolve] oEmbed returned unsafe or invalid src URL:', err);
      }
    }

    // Fallback: fetch page HTML and extract embed ID
    const pageRes = await safeFetch(targetUrl);
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
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
