const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const PRIVATE_IPV4_RANGES: [RegExp, string][] = [
  [/^127\./, 'loopback'],
  [/^10\./, 'private (10.x)'],
  [/^192\.168\./, 'private (192.168.x)'],
  [/^169\.254\./, 'link-local'],
  [/^0\./, 'unspecified']
];

function isPrivate172(ip: string): boolean {
  const match = ip.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

const BLOCKED_IPV6_PREFIXES = ['::1', 'fc', 'fd', 'fe80'];

function isBlockedIPv6(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (bare === '::1') return true;
  return BLOCKED_IPV6_PREFIXES.some((p) => bare.startsWith(p));
}

/**
 * Throws if the URL targets a private/internal network address.
 * Call before every server-side fetch().
 */
export function assertSafeUrl(url: string): void {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL blocked: unsupported protocol ${parsed.protocol}`);
  }

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
  if (IPV4_RE.test(hostname)) {
    for (const [pattern, label] of PRIVATE_IPV4_RANGES) {
      if (pattern.test(hostname)) {
        throw new Error(`URL blocked: ${label}`);
      }
    }
    if (isPrivate172(hostname)) {
      throw new Error(`URL blocked: private (172.16-31.x)`);
    }
  }
}
