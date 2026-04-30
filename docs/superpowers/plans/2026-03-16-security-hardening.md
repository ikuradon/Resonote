# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 security issues (CSP headers, SSRF mitigation, error/URL sanitization) from GitHub Issues #1, #2, #3.

**Architecture:** Three independent tasks that can run in parallel worktrees. Task 1 adds CSP headers via Cloudflare Pages `_headers` file. Task 2 creates a URL validation utility in `functions/lib/` and applies it to all server-side `fetch()` calls (input URL validation only; redirect-based SSRF is mitigated by Cloudflare Workers' network isolation). Task 3 sanitizes error responses and validates external URLs used in `<img src>`.

**Tech Stack:** Cloudflare Pages `_headers`, TypeScript, Vitest

---

## Chunk 1: All Tasks

### Task 1: Add Content-Security-Policy headers (Issue #1)

**Files:**

- Create: `public/_headers`

- [ ] **Step 1: Create `public/_headers` with CSP**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://widget.spreaker.com https://widget.mixcloud.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self' https: wss:; frame-src https://open.spotify.com https://www.youtube.com https://player.vimeo.com https://w.soundcloud.com https://www.mixcloud.com https://widget.spreaker.com https://embed.nicovideo.jp https://www.podbean.com https://player.podbean.com https://embed.music.apple.com https://embed.podcasts.apple.com; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- [ ] **Step 2: Verify build includes `_headers`**

Run: `pnpm build && cat build/_headers`
Expected: File exists in build output (adapter-static copies `public/` to `build/`)

- [ ] **Step 3: Run E2E tests to verify embeds still load**

Run: `pnpm test:e2e`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add public/_headers
git commit -m "Add Content-Security-Policy and security headers (fixes #1)"
```

---

### Task 2: Mitigate SSRF risk in Pages Functions (Issue #2)

**Files:**

- Create: `functions/lib/url-validation.ts`
- Create: `functions/lib/url-validation.test.ts`
- Modify: `functions/api/podcast/resolve.ts:187,245,256,316,340,354`
- Modify: `functions/api/podbean/resolve.ts:25`
- Modify: `functions/lib/audio-metadata.ts:19`

- [ ] **Step 1: Write failing tests for URL validation**

Create `functions/lib/url-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from './url-validation.js';

describe('assertSafeUrl', () => {
  it('should allow valid public URLs', () => {
    expect(() => assertSafeUrl('https://example.com/feed.xml')).not.toThrow();
    expect(() => assertSafeUrl('https://feeds.megaphone.fm/podcast')).not.toThrow();
    expect(() => assertSafeUrl('http://example.com/audio.mp3')).not.toThrow();
  });

  it('should block private IPv4 addresses', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/secret')).toThrow('blocked');
    expect(() => assertSafeUrl('http://10.0.0.1/internal')).toThrow('blocked');
    expect(() => assertSafeUrl('http://192.168.1.1/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.16.0.1/data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://172.31.255.255/data')).toThrow('blocked');
  });

  it('should allow non-private 172.x addresses', () => {
    expect(() => assertSafeUrl('http://172.32.0.1/data')).not.toThrow();
    expect(() => assertSafeUrl('http://172.15.0.1/data')).not.toThrow();
  });

  it('should block link-local addresses', () => {
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow('blocked');
    expect(() => assertSafeUrl('http://169.254.1.1/')).toThrow('blocked');
  });

  it('should block localhost variants', () => {
    expect(() => assertSafeUrl('http://localhost/admin')).toThrow('blocked');
    expect(() => assertSafeUrl('http://0.0.0.0/')).toThrow('blocked');
  });

  it('should block IPv6 loopback and private', () => {
    expect(() => assertSafeUrl('http://[::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fc00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fd00::1]/')).toThrow('blocked');
    expect(() => assertSafeUrl('http://[fe80::1]/')).toThrow('blocked');
  });

  it('should block non-http(s) protocols', () => {
    expect(() => assertSafeUrl('ftp://example.com/file')).toThrow('blocked');
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow('blocked');
    expect(() => assertSafeUrl('javascript:alert(1)')).toThrow('blocked');
  });

  it('should allow domain names that start with private IP octets', () => {
    expect(() => assertSafeUrl('http://10.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://127.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://192.168.example.com/')).not.toThrow();
    expect(() => assertSafeUrl('http://172.16.example.com/')).not.toThrow();
  });

  it('should throw on invalid URLs', () => {
    expect(() => assertSafeUrl('not-a-url')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- functions/lib/url-validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `assertSafeUrl`**

Create `functions/lib/url-validation.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- functions/lib/url-validation.test.ts`
Expected: All pass

- [ ] **Step 5: Apply `assertSafeUrl` to `functions/api/podcast/resolve.ts`**

Add import at top:

```typescript
import { assertSafeUrl } from '../../lib/url-validation.js';
```

Add validation after existing protocol check (line 408, before `detectInputType`):

```typescript
try {
  assertSafeUrl(urlParam);
} catch {
  return jsonResponse({ error: 'url_blocked' }, 400);
}
```

Also wrap each internal fetch that uses a discovered URL (`handleAudioUrl` line 245 rootUrl, line 256 rssUrl; `handleSiteUrl` line 340 siteUrl, line 354 rootUrl):

In `handleAudioUrl`, before `fetch(rootUrl)` at line 245:

```typescript
assertSafeUrl(rootUrl); // inside existing try-catch
```

In `handleAudioUrl`, before `fetch(rssUrl)` at line 256:

```typescript
assertSafeUrl(rssUrl); // inside existing try-catch
```

In `handleSiteUrl`, before `fetch(siteUrl)` at line 340:

```typescript
assertSafeUrl(siteUrl);
```

In `handleSiteUrl`, before `fetch(rootUrl)` at line 354:

```typescript
assertSafeUrl(rootUrl); // inside existing try-catch
```

- [ ] **Step 6: Apply `assertSafeUrl` to `functions/api/podbean/resolve.ts`**

Add import and validate `targetUrl` before the oEmbed fetch, and the fallback `fetch(targetUrl)` at line 25:

```typescript
import { assertSafeUrl } from '../../lib/url-validation.js';
```

After `if (!targetUrl)` check:

```typescript
try {
  assertSafeUrl(targetUrl);
} catch {
  return json({ error: 'url_blocked' }, 400);
}
```

- [ ] **Step 7: Apply `assertSafeUrl` to `functions/lib/audio-metadata.ts`**

Add import and validate before fetch at line 19:

```typescript
import { assertSafeUrl } from './url-validation.js';
```

Inside `fetchAudioMetadata`, before `fetch(url, ...)`:

```typescript
assertSafeUrl(url);
```

- [ ] **Step 8: Run all tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add functions/lib/url-validation.ts functions/lib/url-validation.test.ts functions/api/podcast/resolve.ts functions/api/podbean/resolve.ts functions/lib/audio-metadata.ts
git commit -m "Mitigate SSRF risk with URL validation in Pages Functions (fixes #2)"
```

---

### Task 3: Sanitize error responses and external URLs (Issue #3)

**Files:**

- Modify: `functions/api/podcast/resolve.ts:432-434`
- Modify: `src/lib/utils/emoji.ts:42-43`
- Create: `src/lib/utils/url.ts`
- Create: `src/lib/utils/url.test.ts`
- Modify: `src/lib/stores/profile.svelte.ts:32`
- Modify: `functions/api/podbean/resolve.ts:19-21`

- [ ] **Step 1: Write failing tests for URL sanitization utility**

Create `src/lib/utils/url.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeImageUrl } from './url.js';

describe('sanitizeImageUrl', () => {
  it('should allow https URLs', () => {
    expect(sanitizeImageUrl('https://example.com/pic.jpg')).toBe('https://example.com/pic.jpg');
  });

  it('should allow http URLs', () => {
    expect(sanitizeImageUrl('http://example.com/pic.jpg')).toBe('http://example.com/pic.jpg');
  });

  it('should reject javascript: URLs', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('should reject data: URLs', () => {
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  });

  it('should reject empty strings', () => {
    expect(sanitizeImageUrl('')).toBeUndefined();
  });

  it('should handle undefined input', () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
  });

  it('should reject invalid URLs', () => {
    expect(sanitizeImageUrl('not-a-url')).toBeUndefined();
  });

  it('should reject ftp: URLs', () => {
    expect(sanitizeImageUrl('ftp://example.com/pic.jpg')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/utils/url.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `sanitizeImageUrl`**

Create `src/lib/utils/url.ts`:

```typescript
/**
 * Validate and sanitize an image URL. Returns the URL if safe, undefined otherwise.
 * Only allows http: and https: protocols.
 */
export function sanitizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/utils/url.test.ts`
Expected: All pass

- [ ] **Step 5: Apply `sanitizeImageUrl` to emoji URL validation**

Modify `src/lib/utils/emoji.ts` — in `parseEmojiContent`, add validation when building the emoji map:

```typescript
import { sanitizeImageUrl } from './url.js';
```

Change lines 42-43 from:

```typescript
if (tag.length >= 3) {
  emojiMap.set(tag[1], tag[2]);
}
```

To:

```typescript
if (tag.length >= 3) {
  const safeUrl = sanitizeImageUrl(tag[2]);
  if (safeUrl) emojiMap.set(tag[1], safeUrl);
}
```

- [ ] **Step 6: Apply `sanitizeImageUrl` to profile picture**

Modify `src/lib/stores/profile.svelte.ts` line 32 from:

```typescript
    picture: typeof meta.picture === 'string' ? meta.picture : undefined,
```

To:

```typescript
    picture: typeof meta.picture === 'string' ? sanitizeImageUrl(meta.picture) : undefined,
```

Add import:

```typescript
import { sanitizeImageUrl } from '../utils/url.js';
```

- [ ] **Step 7: Sanitize error response in podcast resolve**

Modify `functions/api/podcast/resolve.ts` lines 432-434 from:

```typescript
  } catch (err) {
    return jsonResponse({ error: 'internal_error', message: String(err) }, 500);
  }
```

To:

```typescript
  } catch {
    return jsonResponse({ error: 'internal_error' }, 500);
  }
```

- [ ] **Step 8: Validate Podbean oEmbed embed URL domain**

Modify `functions/api/podbean/resolve.ts` lines 19-21 from:

```typescript
const srcMatch = data.html?.match(/src="([^"]+)"/);
if (srcMatch?.[1]) {
  return json({ embedSrc: srcMatch[1] });
}
```

To:

```typescript
const srcMatch = data.html?.match(/src="([^"]+)"/);
if (srcMatch?.[1]) {
  try {
    const embedHost = new URL(srcMatch[1]).hostname;
    if (embedHost === 'podbean.com' || embedHost.endsWith('.podbean.com')) {
      return json({ embedSrc: srcMatch[1] });
    }
  } catch {
    // invalid URL from oEmbed — fall through
  }
}
```

- [ ] **Step 9: Update emoji tests for URL validation**

Add tests to `src/lib/utils/emoji.test.ts`:

```typescript
it('should reject emoji with javascript: URL', () => {
  const result = parseEmojiContent(':evil:', [['emoji', 'evil', 'javascript:alert(1)']]);
  expect(result).toEqual([{ type: 'text', value: ':evil:' }]);
});

it('should reject emoji with data: URL', () => {
  const result = parseEmojiContent(':evil:', [
    ['emoji', 'evil', 'data:text/html,<script>alert(1)</script>']
  ]);
  expect(result).toEqual([{ type: 'text', value: ':evil:' }]);
});
```

- [ ] **Step 10: Run all tests**

Run: `pnpm test`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add src/lib/utils/url.ts src/lib/utils/url.test.ts src/lib/utils/emoji.ts src/lib/utils/emoji.test.ts src/lib/stores/profile.svelte.ts functions/api/podcast/resolve.ts functions/api/podbean/resolve.ts
git commit -m "Sanitize error responses and validate external URLs (fixes #3)"
```

---

## Final Verification

- [ ] **Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: All 5 checks pass

## Parallel Execution Strategy

All 3 tasks are independent and can be executed in parallel worktrees:

| Worktree | Task                       | Branch                        |
| -------- | -------------------------- | ----------------------------- |
| 1        | Task 1: CSP headers        | `security/csp-headers`        |
| 2        | Task 2: SSRF mitigation    | `security/ssrf-mitigation`    |
| 3        | Task 3: Sanitize responses | `security/sanitize-responses` |

**Note:** Task 2 and Task 3 both modify `functions/api/podcast/resolve.ts` and `functions/api/podbean/resolve.ts`. The changes are to different lines and should merge cleanly, but verify after merging.
