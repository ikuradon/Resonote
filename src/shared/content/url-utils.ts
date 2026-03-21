// @public — Stable API for route/component/feature consumers
export function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function normalizeUrl(url: string): string {
  const withoutQuery = url.split('?')[0].split('#')[0];
  const withoutScheme = stripScheme(withoutQuery);

  const slashIndex = withoutScheme.indexOf('/');
  let host: string;
  let path: string;
  if (slashIndex === -1) {
    host = withoutScheme.toLowerCase();
    path = '';
  } else {
    host = withoutScheme.slice(0, slashIndex).toLowerCase();
    path = withoutScheme.slice(slashIndex);
  }

  return host + path.replace(/\/$/, '');
}

export function toBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(encoded: string): string | null {
  if (!encoded) return null;

  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }

  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function extractTimeParam(url: string): number {
  try {
    const parsed = new URL(url);
    const t =
      parsed.searchParams.get('t') ??
      parsed.searchParams.get('start') ??
      parsed.searchParams.get('from');
    if (t) {
      const sec = parseInt(t, 10);
      if (!isNaN(sec) && sec > 0) return sec;
    }
    const hashMatch = parsed.hash.match(/[#&]t=(\d+)/);
    if (hashMatch) {
      const sec = parseInt(hashMatch[1], 10);
      if (!isNaN(sec) && sec > 0) return sec;
    }
  } catch {
    // Invalid URL
  }
  return 0;
}
