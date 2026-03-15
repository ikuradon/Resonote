export function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function normalizeUrl(url: string): string {
  // Remove query params and fragments first
  const withoutQuery = url.split('?')[0].split('#')[0];

  // Strip scheme
  const withoutScheme = stripScheme(withoutQuery);

  // Lowercase host, preserve path
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

  // Remove trailing slash from path
  const normalized = host + path.replace(/\/$/, '');
  return normalized;
}

export function toBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
