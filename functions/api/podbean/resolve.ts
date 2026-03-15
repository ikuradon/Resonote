// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'missing_url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'fetch_failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const html = await res.text();
    // Look for embed ID pattern: pb-xxxxx-xxxxxxx
    const match = html.match(/pb-[a-z0-9]+-[a-z0-9]+/);
    if (match) {
      return new Response(JSON.stringify({ embedId: match[0] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'embed_id_not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
