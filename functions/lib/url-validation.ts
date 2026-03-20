const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const PRIVATE_IPV4_RANGES: RegExp[] = [
  /^127\./, // loopback
  /^10\./, // private (10.x)
  /^192\.168\./, // private (192.168.x)
  /^169\.254\./, // link-local
  /^0\./ // unspecified
];

function isPrivate172(ip: string): boolean {
  const match = ip.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

function isPrivateIPv4(ip: string): boolean {
  for (const pattern of PRIVATE_IPV4_RANGES) {
    if (pattern.test(ip)) return true;
  }
  return isPrivate172(ip);
}

// Match IPv4-mapped (::ffff:HHHH:HHHH) and IPv4-compatible (::HHHH:HHHH)
const IPV4_EMBEDDED_IPV6_RE = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

function ipv6MappedToIPv4(bare: string): string | null {
  const match = bare.match(IPV4_EMBEDDED_IPV6_RE);
  if (!match) return null;
  const hi = parseInt(match[1], 16);
  const lo = parseInt(match[2], 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

const BLOCKED_IPV6_PREFIXES = ['::1', 'fc', 'fd', 'fe80', '2002:', '2001:'];

function isBlockedIPv6(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (bare === '::') return true;
  if (BLOCKED_IPV6_PREFIXES.some((p) => bare.startsWith(p))) return true;
  const mapped = ipv6MappedToIPv4(bare);
  if (mapped && isPrivateIPv4(mapped)) return true;
  return false;
}

const MAX_REDIRECTS = 5;

export interface SafeFetchOptions extends RequestInit {
  allowPrivateIPs?: boolean;
}

/**
 * Fetch with SSRF-safe redirect handling.
 * Validates each redirect hop against assertSafeUrl before following.
 */
export async function safeFetch(url: string, options?: SafeFetchOptions): Promise<Response> {
  const { allowPrivateIPs, ...fetchOptions } = options ?? {};
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    assertSafeUrl(currentUrl, !!allowPrivateIPs);
    const res = await fetch(currentUrl, { ...fetchOptions, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without Location header');
      await res.body?.cancel();
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

/**
 * Throws if the URL targets a private/internal network address.
 */
export function assertSafeUrl(url: string, allowPrivateIPs = false): void {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL blocked: unsupported protocol ${parsed.protocol}`);
  }

  if (allowPrivateIPs) return;

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`URL blocked: ${hostname}`);
  }

  // IPv6 check (bracketed notation)
  if (hostname.startsWith('[') || hostname.includes(':')) {
    if (isBlockedIPv6(hostname)) {
      throw new Error(`URL blocked: private IPv6 address`);
    }
    return;
  }

  // IPv4 range checks — only apply to actual IP addresses, not domain names
  // (e.g. "10.example.com" should NOT be blocked)
  if (IPV4_RE.test(hostname) && isPrivateIPv4(hostname)) {
    throw new Error(`URL blocked: private IPv4 address`);
  }
}
