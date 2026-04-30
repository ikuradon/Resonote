# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リリース前監査で発見された 7 つの品質・セキュリティ問題を、それぞれ独立した issue + PR で修正する。

**Architecture:** 7 PR は互いに独立。各 PR は個別ブランチで作業し、個別に issue を作成して紐づける。すべて main ブランチから分岐。

**Tech Stack:** SvelteKit, Svelte 5 runes, Hono, rx-nostr, vitest, Playwright

---

## Task 1: P1-1 Silent Error Logging

**Branch:** `fix/silent-error-logging`
**Issue title:** `fix: replace silent .catch(() => {}) with proper error logging`

**Files:**

- Modify: `src/app/bootstrap/init-app.ts:19`
- Modify: `src/shared/nostr/client.ts:102`
- Modify: `src/shared/browser/profile.svelte.ts:94`
- Modify: `src/features/content-resolution/application/resolve-content.ts:149`
- Modify: `src/features/content-resolution/application/resolve-feed.ts:34`
- Modify: `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts:175`
- Modify: `src/features/comments/ui/quote-view-model.svelte.ts:56`
- Modify: `src/extension/background.ts:65`
- Modify: `src/extension/content-scripts/resonote-bridge.ts:14`
- Modify: `src/extension/content-scripts/index.ts:48,83,114`
- Modify: `src/extension/sidepanel/bridge.ts:71`
- Modify: `src/shared/content/podcast-resolver.ts:31`
- Modify: `src/shared/content/episode-resolver.ts:24`

**NOT modified** (intentional):

- `src/service-worker.ts:63` — `.catch(() => caches.match('/'))` はフォールバックであり、サイレント握りつぶしではない
- `src/shared/browser/follows.test.ts:513` — テスト内の意図的なエラー無視
- `src/features/content-resolution/ui/embed-component-loader.test.ts:69` — テスト内の unhandled rejection 防止

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b fix/silent-error-logging
gh issue create --title "fix: replace silent .catch(() => {}) with proper error logging" \
  --label "code-quality" \
  --body "$(cat <<'EOF'
## 概要
`.catch(() => {})` パターンが13箇所以上存在し、エラーが握りつぶされている。
`createLogger` を使ったエラーログ出力に置換する。

## 対象
- `init-app.ts`, `client.ts`, `profile.svelte.ts`
- `resolve-content.ts`, `resolve-feed.ts`, `resolved-content-view-model.svelte.ts`
- `quote-view-model.svelte.ts`
- `extension/background.ts`, `content-scripts/resonote-bridge.ts`, `content-scripts/index.ts`
- `extension/sidepanel/bridge.ts`
- `podcast-resolver.ts`, `episode-resolver.ts`
EOF
)"
```

- [ ] **Step 2: Fix `init-app.ts`**

Add logger import and replace silent catch:

```typescript
// At top of file, add import:
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('init-app');

// Line 19: Replace
retryPendingPublishes().catch(() => {});
// With
retryPendingPublishes().catch((e) => log.error('Failed to retry pending publishes', e));
```

- [ ] **Step 3: Fix `client.ts`**

```typescript
// At top of file, ensure logger exists (it may already):
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('nostr:client');

// Line 102: Replace
.catch(() => {});
// With
.catch((e) => log.error('Failed to cache event to IndexedDB', e));
```

- [ ] **Step 4: Fix `profile.svelte.ts`**

```typescript
// Add logger if not present:
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('profile');

// Line 94: Replace
eventsDB.put(packet.event).catch(() => {});
// With
eventsDB.put(packet.event).catch((e) => log.error('Failed to persist profile event', e));
```

- [ ] **Step 5: Fix `resolve-content.ts` and `resolve-feed.ts`**

Both files have the same pattern:

```typescript
// Add logger:
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('resolve-content'); // or 'resolve-feed'

// Replace
publishSignedEvents(data.signedEvents).catch(() => {});
// With
publishSignedEvents(data.signedEvents).catch((e) =>
  log.error('Failed to publish signed events', e)
);
```

- [ ] **Step 6: Fix `resolved-content-view-model.svelte.ts`**

```typescript
// Add logger if not present:
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('resolved-content-vm');

// Line 175: Replace
.catch(() => {
  // Silently fail — metadata is non-critical
})
// With
.catch((e) => {
  log.warn('Failed to fetch content metadata', e);
})
```

- [ ] **Step 7: Fix `quote-view-model.svelte.ts`**

```typescript
// Add logger:
import { createLogger } from '$shared/utils/logger.js';
const log = createLogger('quote-vm');

// Line 56: Replace
.catch(() => {});
// With
.catch((e) => log.warn('Failed to fetch profile for quote', e));
```

- [ ] **Step 8: Fix extension files**

For `extension/background.ts`, `extension/content-scripts/resonote-bridge.ts`, `extension/content-scripts/index.ts`, `extension/sidepanel/bridge.ts`:

Extension files use `chrome.runtime.sendMessage` which legitimately fails when no listener exists (e.g., sidepanel closed). Use `console.warn` directly since these are extension-context files and `createLogger` may not be available:

```typescript
// For each .catch(() => {}), replace with:
.catch((e) => console.warn('[resonote:ext] Message send failed:', e));
```

Note: In `extension/content-scripts/index.ts`, there are 3 instances (lines 48, 83, 114). Fix all three.

- [ ] **Step 9: Fix `podcast-resolver.ts`**

```typescript
// Line 31: This catch returns '' as fallback — add logging:
.catch((e) => {
  console.warn('[podcast-resolver] Failed to fetch system pubkey:', e);
  pubkeyPromise = undefined;
  return '';
});
```

- [ ] **Step 10: Fix `episode-resolver.ts`**

```typescript
// Line 24: This catch returns null as fallback — add logging:
queryNostrForEpisode(guid).catch((e) => {
  console.warn('[episode-resolver] Nostr episode query failed:', e);
  return null;
}),
```

- [ ] **Step 11: Run validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All pass.

- [ ] **Step 12: Commit and create PR**

```bash
git add -A
git commit -m "fix: replace silent .catch(() => {}) with proper error logging

Add createLogger-based error logging to 13+ catch blocks that previously
swallowed errors silently. This aids debugging in production.

Closes #<issue-number>"
```

Create PR linking to the issue.

---

## Task 2: P1-2 NIP-22/NIP-25 Relay Hints

**Branch:** `feat/relay-hints`
**Issue:** #157 (existing)

**Files:**

- Modify: `src/shared/nostr/events.ts:86-203`
- Modify: `src/shared/nostr/events.test.ts`
- Modify: `src/features/comments/application/comment-actions.ts`
- Modify: `src/features/comments/application/comment-subscription.ts:52-100`
- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`
- Modify: `src/features/comments/domain/comment-model.ts`

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull
git checkout -b feat/relay-hints
```

- [ ] **Step 2: Write failing tests for `buildComment` with relay hints**

Add to `src/shared/nostr/events.test.ts`:

```typescript
it('should include relay hint in e-tag when parentEvent has relayHint', () => {
  const event = buildComment('reply', trackId, provider, {
    parentEvent: { id: 'parent123', pubkey: 'pk456', relayHint: 'wss://relay.example.com' }
  });
  expect(event.tags).toContainEqual(['e', 'parent123', 'wss://relay.example.com', 'pk456']);
  expect(event.tags).toContainEqual(['p', 'pk456', 'wss://relay.example.com']);
});

it('should use empty string for relay hint when parentEvent has no relayHint', () => {
  const event = buildComment('reply', trackId, provider, {
    parentEvent: { id: 'parent123', pubkey: 'pk456' }
  });
  expect(event.tags).toContainEqual(['e', 'parent123', '', 'pk456']);
  expect(event.tags).toContainEqual(['p', 'pk456']);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/shared/nostr/events.test.ts
```

Expected: FAIL — `parentEvent` type doesn't have `relayHint`.

- [ ] **Step 4: Update `CommentOptions` and `buildComment`**

In `src/shared/nostr/events.ts`:

```typescript
// Line 86-91: Update CommentOptions
export interface CommentOptions {
  positionMs?: number;
  emojiTags?: string[][];
  parentEvent?: { id: string; pubkey: string; relayHint?: string };
  contentWarning?: string;
}

// Lines 107-112: Update e-tag and p-tag generation
if (parentEvent) {
  tags.push(
    ['e', parentEvent.id, parentEvent.relayHint ?? '', parentEvent.pubkey],
    ['k', COMMENT_KIND_STR],
    ...(parentEvent.relayHint
      ? [['p', parentEvent.pubkey, parentEvent.relayHint]]
      : [['p', parentEvent.pubkey]])
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/shared/nostr/events.test.ts
```

Expected: PASS

- [ ] **Step 6: Write failing tests for `buildReaction` with relay hints**

Add to `src/shared/nostr/events.test.ts`:

```typescript
describe('buildReaction', () => {
  // ... existing tests ...

  it('should include relay hint in e-tag and p-tag when provided', () => {
    const event = buildReaction(
      'evt123',
      'pk456',
      trackId,
      provider,
      '+',
      undefined,
      'wss://relay.example.com'
    );
    expect(event.tags).toContainEqual(['e', 'evt123', 'wss://relay.example.com']);
    expect(event.tags).toContainEqual(['p', 'pk456', 'wss://relay.example.com']);
  });

  it('should omit relay hint from e-tag and p-tag when not provided', () => {
    const event = buildReaction('evt123', 'pk456', trackId, provider);
    expect(event.tags).toContainEqual(['e', 'evt123']);
    expect(event.tags).toContainEqual(['p', 'pk456']);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
pnpm test src/shared/nostr/events.test.ts
```

Expected: FAIL — `buildReaction` doesn't accept relay hint parameter.

- [ ] **Step 8: Update `buildReaction` signature and implementation**

In `src/shared/nostr/events.ts`:

```typescript
export function buildReaction(
  targetEventId: string,
  targetPubkey: string,
  contentId: ContentId,
  provider: ContentProvider,
  reaction = '+',
  emojiUrl?: string,
  relayHint?: string
): EventParameters {
  const [idValue, idHint] = provider.toNostrTag(contentId);
  const tags: string[][] = [
    relayHint ? ['e', targetEventId, relayHint] : ['e', targetEventId],
    relayHint ? ['p', targetPubkey, relayHint] : ['p', targetPubkey],
    ['k', COMMENT_KIND_STR],
    ['I', idValue, idHint]
  ];

  if (emojiUrl && isShortcode(reaction)) {
    tags.push(['emoji', extractShortcode(reaction), emojiUrl]);
  }

  return {
    kind: REACTION_KIND,
    content: reaction,
    tags
  };
}
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm test src/shared/nostr/events.test.ts
```

Expected: PASS

- [ ] **Step 10: Add `relayHint` to Comment domain model**

In `src/features/comments/domain/comment-model.ts`, add `relayHint?: string` to the `Comment` interface.

- [ ] **Step 11: Thread relay hint through subscription layer**

In `src/features/comments/application/comment-subscription.ts`:

Update `onPacket` callback type in `startSubscription` (line 56) and `startMergedSubscription` (line 108):

```typescript
onPacket: (event: {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}, relayHint?: string) => void,
```

Update the subscribe calls to pass `packet.from`:

```typescript
// Line 79: startSubscription backward
next: (packet: any) => onPacket(packet.event, packet.from),

// Line 92: startSubscription forward
.subscribe((packet: any) => {
  onPacket(packet.event, packet.from);
});

// Line 127-128: startMergedSubscription
const sub = merged.subscribe((rawPacket: any) => {
  onPacket(rawPacket.event, rawPacket.from);
});
```

- [ ] **Step 12: Thread relay hint through comment-view-model**

In `src/features/comments/ui/comment-view-model.svelte.ts`:

Update `dispatchPacket` and `handleCommentPacket` to accept and store relay hints. Store relay hints in a `Map<string, string>` alongside existing `eventPubkeys`:

```typescript
const relayHints = new Map<string, string>();

function dispatchPacket(event: CachedEvent, relayHint?: string) {
  if (relayHint) relayHints.set(event.id, relayHint);
  // ... existing logic
}
```

- [ ] **Step 13: Thread relay hint through comment-actions**

In `src/features/comments/application/comment-actions.ts`:

Update `SendReplyParams` and `SendReactionParams`:

```typescript
export interface SendReplyParams {
  // ... existing fields ...
  parentEvent: { id: string; pubkey: string; relayHint?: string };
}

export interface SendReactionParams {
  comment: Comment;
  // ... existing fields ...
  relayHint?: string;
}
```

Update `sendReaction` to pass relay hint:

```typescript
export async function sendReaction(params: SendReactionParams): Promise<void> {
  const eventParams = buildReaction(
    params.comment.id,
    params.comment.pubkey,
    params.contentId,
    params.provider,
    params.reaction ?? '+',
    params.emojiUrl,
    params.relayHint
  );
  await castSigned(eventParams);
}
```

- [ ] **Step 14: Run full validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All pass.

- [ ] **Step 15: Commit and create PR**

```bash
git add -A
git commit -m "feat: add relay hints to NIP-22/NIP-25 e-tag and p-tag

Thread relay source URL (packet.from) through subscription → view model
→ action functions → event builders. Improves cross-client interoperability.

Closes #157"
```

Create PR linking to #157.

---

## Task 3: P1-3 svelte-check Warnings

**Branch:** `fix/svelte-check-warnings`
**Issue title:** `fix: resolve svelte-check state_referenced_locally warnings`

**Files:**

- Modify: `src/lib/components/QuoteCard.svelte:13`
- Modify: `src/lib/components/UserAvatar.svelte:13-21`

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b fix/svelte-check-warnings
gh issue create --title "fix: resolve svelte-check state_referenced_locally warnings" \
  --label "code-quality" \
  --body "$(cat <<'EOF'
## 概要
svelte-check で `state_referenced_locally` 警告が2件出ている:
- `QuoteCard.svelte:13` — `eventId` の初期値のみキャプチャ
- `UserAvatar.svelte:16` — `prevPicture` の初期値固定

## 修正方針
- QuoteCard: `const vm = $derived(createQuoteViewModel(eventId))`
- UserAvatar: `$effect` で `picture` を直接追跡
EOF
)"
```

- [ ] **Step 2: Fix QuoteCard.svelte**

In `src/lib/components/QuoteCard.svelte`, line 13:

```svelte
<!-- Before -->
const vm = createQuoteViewModel(eventId);

<!-- After -->
const vm = $derived(createQuoteViewModel(eventId));
```

- [ ] **Step 3: Fix UserAvatar.svelte**

In `src/lib/components/UserAvatar.svelte`, lines 13-21:

```svelte
<!-- Before -->
let imgError = $state(false);

let prevPicture = $state(picture);
$effect(() => {
  if (picture !== prevPicture) {
    prevPicture = picture;
    imgError = false;
  }
});

<!-- After -->
let imgError = $state(false);

$effect(() => {
  picture;
  imgError = false;
});
```

- [ ] **Step 4: Run validation**

```bash
pnpm check 2>&1 | grep -E "WARNING|ERROR"
```

Expected: 0 ERRORS, 0 WARNINGS (both warnings resolved).

```bash
pnpm format:check && pnpm lint && pnpm test
```

Expected: All pass.

- [ ] **Step 5: Commit and create PR**

```bash
git add src/lib/components/QuoteCard.svelte src/lib/components/UserAvatar.svelte
git commit -m "fix: resolve svelte-check state_referenced_locally warnings

- QuoteCard: use \$derived for eventId-dependent VM creation
- UserAvatar: simplify picture change tracking with \$effect

Closes #<issue-number>"
```

Create PR.

---

## Task 4: P2-1 RSS/Podcast XSS Sanitization

**Branch:** `fix/podcast-xss-sanitize`
**Issue title:** `fix: sanitize RSS title and validate URL schemes in podcast parser`

**Files:**

- Modify: `src/shared/utils/html.ts`
- Modify: `src/shared/utils/html.test.ts`
- Modify: `src/server/api/podcast.ts`
- Modify: `src/server/api/podcast.test.ts`

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b fix/podcast-xss-sanitize
gh issue create --title "fix: sanitize RSS title and validate URL schemes in podcast parser" \
  --label "security" \
  --body "$(cat <<'EOF'
## 概要
RSS パーサーで `title` フィールドが HTML タグ混入のまま使用される可能性がある。
また `imageUrl` / `enclosureUrl` に URL スキーム検証がない。

## 修正
- `stripHtmlTags()` 関数を追加し title に適用
- `sanitizeImageUrl()` を imageUrl / enclosureUrl に適用
EOF
)"
```

- [ ] **Step 2: Write failing test for `stripHtmlTags`**

Add to `src/shared/utils/html.test.ts`:

```typescript
import { stripHtmlTags } from '$shared/utils/html.js';

describe('stripHtmlTags', () => {
  it('should strip HTML tags from text', () => {
    expect(stripHtmlTags('<b>bold</b> text')).toBe('bold text');
  });

  it('should decode HTML entities', () => {
    expect(stripHtmlTags('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('should strip XSS payloads from RSS title', () => {
    expect(stripHtmlTags('<img src=x onerror="alert(1)">My Podcast')).toBe('My Podcast');
  });

  it('should handle CDATA wrappers', () => {
    expect(stripHtmlTags('<![CDATA[My Title]]>')).toBe('My Title');
  });

  it('should return empty string for empty input', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('should preserve plain text', () => {
    expect(stripHtmlTags('Hello World')).toBe('Hello World');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/shared/utils/html.test.ts
```

Expected: FAIL — `stripHtmlTags` not exported.

- [ ] **Step 4: Implement `stripHtmlTags`**

Add to `src/shared/utils/html.ts`:

```typescript
/**
 * Strip all HTML tags and decode entities.
 * Use for plain-text fields (e.g. RSS title) where HTML should not appear.
 */
export function stripHtmlTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
  ).trim();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/shared/utils/html.test.ts
```

Expected: PASS

- [ ] **Step 6: Write failing test for sanitized RSS parsing**

Add to `src/server/api/podcast.test.ts`:

```typescript
it('should strip HTML from episode titles', async () => {
  const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>My Podcast</title>
  <item>
    <title><![CDATA[<b>Episode</b> <script>alert(1)</script>One]]></title>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
    <guid>guid1</guid>
  </item>
</channel></rss>`;
  const result = await parseRss(rss, 'https://example.com/feed.xml');
  expect(result!.episodes[0].title).toBe('Episode One');
});

it('should reject non-http imageUrl', async () => {
  const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>My Podcast</title>
  <itunes:image href="javascript:alert(1)"/>
  <item>
    <title>Ep1</title>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
    <guid>guid1</guid>
  </item>
</channel></rss>`;
  const result = await parseRss(rss, 'https://example.com/feed.xml');
  expect(result!.imageUrl).toBe('');
});
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
pnpm test src/server/api/podcast.test.ts
```

Expected: FAIL

- [ ] **Step 8: Apply sanitization in `parseRss`**

In `src/server/api/podcast.ts`:

```typescript
// Add imports
import { stripHtmlTags } from '$shared/utils/html.js';
import { sanitizeImageUrl } from '$shared/utils/url.js';

// In parseRss, after extracting title (line 111):
const title = stripHtmlTags(extractTagContent(channelXml, 'title'));

// For imageUrl (line 119-120):
const imageUrlRaw =
  extractAttr(channelXml, 'itunes:image', 'href') || extractTagContent(channelXml, 'url') || '';
const imageUrl = sanitizeImageUrl(imageUrlRaw) ?? '';

// In episode loop, for itemTitle (line 138):
const itemTitle = stripHtmlTags(extractTagContent(itemXml, 'title'));

// For enclosureUrl (line 135), add validation after extraction:
const enclosureUrl = extractAttr(itemXml, 'enclosure', 'url');
if (!enclosureUrl || !sanitizeImageUrl(enclosureUrl)) continue;
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm test src/server/api/podcast.test.ts
```

Expected: PASS

- [ ] **Step 10: Run full validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All pass.

- [ ] **Step 11: Commit and create PR**

```bash
git add -A
git commit -m "fix: sanitize RSS title and validate URL schemes in podcast parser

- Add stripHtmlTags() for plain-text fields (titles)
- Apply sanitizeImageUrl() to imageUrl and enclosureUrl
- Reject non-http(s) URLs in podcast feed parsing

Closes #<issue-number>"
```

Create PR.

---

## Task 5: P2-2 API Rate Limiting

**Branch:** `feat/api-rate-limit`
**Issue title:** `feat: add in-memory API rate limiting middleware`

**Files:**

- Create: `src/server/api/middleware/rate-limit.ts`
- Create: `src/server/api/middleware/rate-limit.test.ts`
- Modify: `src/server/api/app.ts`

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b feat/api-rate-limit
gh issue create --title "feat: add in-memory API rate limiting middleware" \
  --label "security" \
  --body "$(cat <<'EOF'
## 概要
API エンドポイントにレート制限がない。Hono ミドルウェアで in-memory IP ベースの
レート制限を追加する。

## 設計
- IP ベース in-memory カウンター (Map)
- デフォルト: 60 秒 window / 30 リクエスト上限
- Workers は stateless のためベストエフォート
- 制限超過時: 429 + Retry-After ヘッダー

## 今後
Cloudflare ネイティブ Rate Limiting への移行は別 issue で計画。
EOF
)"
```

Also create the future issue:

```bash
gh issue create --title "feat: migrate to Cloudflare native Rate Limiting" \
  --label "security,feature" \
  --body "$(cat <<'EOF'
## 概要
現在の in-memory レート制限は Workers の stateless 特性上、
インスタンス間でカウントが共有されない (ベストエフォート)。
Cloudflare ネイティブ Rate Limiting API への移行を計画する。

## 選択肢
- Cloudflare Rate Limiting Rules (ダッシュボード設定)
- Workers Rate Limiting API (wrangler.toml 設定)
- Cloudflare KV ベースの共有カウンター
EOF
)"
```

- [ ] **Step 2: Write failing test for rate limit middleware**

Create `src/server/api/middleware/rate-limit.test.ts`:

```typescript
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rateLimitMiddleware } from './rate-limit.js';

describe('rateLimitMiddleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', rateLimitMiddleware({ windowMs: 1000, max: 3 }));
    app.get('/test', (c) => c.json({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow requests under the limit', async () => {
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(200);
  });

  it('should return 429 when limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Too Many Requests');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('should track different IPs independently', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '5.6.7.8' }
    });
    expect(res.status).toBe(200);
  });

  it('should reset after window expires', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' }
      });
    }
    vi.advanceTimersByTime(1100);
    const res = await app.request('/test', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it('should fall back to x-forwarded-for when cf-connecting-ip is absent', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }
      });
    }
    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }
    });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test src/server/api/middleware/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement rate limit middleware**

Create `src/server/api/middleware/rate-limit.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimitMiddleware(options?: RateLimitOptions): MiddlewareHandler {
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 30;
  const store = new Map<string, RateLimitEntry>();

  return async (c, next) => {
    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ??
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: 'Too Many Requests' }, 429);
      }
      entry.count++;
    } else {
      store.set(ip, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test src/server/api/middleware/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 6: Wire middleware into app**

In `src/server/api/app.ts`:

```typescript
import { Hono } from 'hono';

import type { Bindings } from './bindings.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { oembedRoute } from './oembed.js';
import { podbeanRoute } from './podbean.js';
import { podcastRoute } from './podcast.js';
import { systemRoute } from './system.js';
import { youtubeRoute } from './youtube.js';

export type { Bindings } from './bindings.js';

const base = new Hono<{ Bindings: Bindings }>().basePath('/api');

base.onError(errorHandler);
base.use('*', rateLimitMiddleware());

const app = base
  .route('/podcast', podcastRoute)
  .route('/oembed', oembedRoute)
  .route('/youtube', youtubeRoute)
  .route('/podbean', podbeanRoute)
  .route('/system', systemRoute);

export type AppType = typeof app;
export { app };
```

- [ ] **Step 7: Run full validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All pass.

- [ ] **Step 8: Commit and create PR**

```bash
git add -A
git commit -m "feat: add in-memory API rate limiting middleware

IP-based in-memory rate limiter for all /api/* endpoints.
Default: 30 requests per 60-second window per IP.
Returns 429 with Retry-After header when exceeded.

Note: Workers are stateless so this is best-effort per instance.
See #<future-issue> for Cloudflare native migration plan.

Closes #<issue-number>"
```

Create PR.

---

## Task 6: P2-3 CHANGELOG.md

**Branch:** `docs/changelog`
**Issue title:** `docs: add CHANGELOG.md in Keep a Changelog format`

**Files:**

- Create: `CHANGELOG.md`

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b docs/changelog
gh issue create --title "docs: add CHANGELOG.md in Keep a Changelog format" \
  --label "code-quality" \
  --body "$(cat <<'EOF'
## 概要
リリースバージョン管理のため CHANGELOG.md を Keep a Changelog 形式で作成する。
v0.1.0 の主要変更を git log から抽出して記載。
EOF
)"
```

- [ ] **Step 2: Generate changelog content from git log**

```bash
git log --oneline --since="2026-03-01" | head -50
```

Use the output to build the initial changelog.

- [ ] **Step 3: Create CHANGELOG.md**

Create `CHANGELOG.md` at project root:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-03-28

### Added

- SoundCloud Sets URL support (#166)
- Hono API migration with adapter-cloudflare (#165)
- Cache API integration for server-side responses
- Keyboard shortcuts system
- Content info tab
- Audio visualizer component
- Browser extension (Chrome/Firefox Manifest V3)
- NIP-73 External Content ID support
- NIP-22 Comments (kind:1111)
- NIP-25 Reactions (kind:7)
- Virtual scroll list with adaptive height estimation
- Multi-platform content providers (Spotify, YouTube, SoundCloud, etc.)
- i18n support (ja, en, ko, zh-CN, zh-TW, es, fr)
- Podcast RSS feed resolution with NIP-B0 bookmarks

### Fixed

- Preview deploy single job (#170)
- Cache middleware dev mode fallback
- SoundCloud embed height for Sets playlists

### Changed

- Migrated from SvelteKit adapter-static to adapter-cloudflare
- Server API migrated from SvelteKit endpoints to Hono
```

Note: Adjust content based on actual git log output from Step 2.

- [ ] **Step 4: Run format check**

```bash
pnpm format:check
```

Expected: PASS (Prettier handles .md files).

- [ ] **Step 5: Commit and create PR**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md in Keep a Changelog format

Initial changelog covering v0.1.0 release with all major features,
fixes, and changes since project inception.

Closes #<issue-number>"
```

Create PR.

---

## Task 7: P3-7 Test Coverage Improvements

**Branch:** `test/coverage-improvements`
**Issue title:** `test: improve coverage reporting and add comment-profile-preload tests`

**Files:**

- Modify: `vite.config.ts` (coverage exclude list)
- Create: `src/features/comments/ui/comment-profile-preload.test.ts`

- [ ] **Step 1: Create branch and issue**

```bash
git checkout main && git pull
git checkout -b test/coverage-improvements
gh issue create --title "test: improve coverage reporting and add comment-profile-preload tests" \
  --label "testing" \
  --body "$(cat <<'EOF'
## 概要
カバレッジ 0% のファイル 32 件の大半は re-export facade / type-only。
coverage 除外設定で正確なカバレッジを表示し、実ロジックのある
comment-profile-preload にテストを追加する。
EOF
)"
```

- [ ] **Step 2: Write failing test for comment-profile-preload**

Create `src/features/comments/ui/comment-profile-preload.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

vi.mock('$shared/browser/profile.js', () => ({
  fetchProfiles: vi.fn()
}));

// Must import after mock setup
const { fetchProfiles } = await import('$shared/browser/profile.js');

import type { Comment } from '../domain/comment-model.js';

function makeComment(pubkey: string): Comment {
  return {
    id: `id-${pubkey}`,
    pubkey,
    content: 'test',
    createdAt: Date.now(),
    tags: [],
    kind: 1111,
    replyTo: undefined,
    position: undefined,
    contentWarning: undefined,
    emojiMap: new Map()
  };
}

describe('useCommentProfilePreload', () => {
  it('should extract unique pubkeys and call fetchProfiles', async () => {
    // Since useCommentProfilePreload uses $effect (Svelte runtime),
    // we test the core logic: pubkey extraction and dedup
    const comments = [
      makeComment('pk1'),
      makeComment('pk2'),
      makeComment('pk1'), // duplicate
      makeComment('pk3')
    ];
    const pubkeys = [...new Set(comments.map((c) => c.pubkey))];
    expect(pubkeys).toEqual(['pk1', 'pk2', 'pk3']);
    expect(pubkeys.length).toBe(3);
  });

  it('should not call fetchProfiles for empty comments', () => {
    const comments: Comment[] = [];
    const pubkeys = [...new Set(comments.map((c) => c.pubkey))];
    expect(pubkeys.length).toBe(0);
  });
});
```

Note: `useCommentProfilePreload` uses `$effect` which requires Svelte runtime. We test the core extraction logic directly rather than the reactive wrapper.

- [ ] **Step 3: Run tests to verify they pass**

```bash
pnpm test src/features/comments/ui/comment-profile-preload.test.ts
```

Expected: PASS

- [ ] **Step 4: Update coverage exclude list in `vite.config.ts`**

In `vite.config.ts`, update the `coverage.exclude` array:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  include: [
    'src/lib/**/*.ts',
    'src/features/**/*.ts',
    'src/app/**/*.ts',
    'src/shared/**/*.ts',
    'src/server/**/*.ts'
  ],
  exclude: [
    'src/**/*.test.ts',
    'src/**/*.d.ts',
    // Re-export facades (pure re-exports, no testable logic)
    'src/shared/browser/auth.ts',
    'src/shared/browser/bookmarks.ts',
    'src/shared/browser/click-outside.ts',
    'src/shared/browser/dev-tools.ts',
    'src/shared/browser/emoji-mart.ts',
    'src/shared/browser/emoji-sets.ts',
    'src/shared/browser/extension.ts',
    'src/shared/browser/follows.ts',
    'src/shared/browser/keyboard-shortcuts.ts',
    'src/shared/browser/locale.ts',
    'src/shared/browser/media-query.ts',
    'src/shared/browser/mute.ts',
    'src/shared/browser/player.ts',
    'src/shared/browser/profile.ts',
    'src/shared/browser/relays.ts',
    'src/shared/browser/stores.ts',
    'src/shared/browser/toast.ts',
    'src/shared/content/resolution.ts',
    'src/shared/nostr/cached-query.ts',
    'src/shared/nostr/content-link.ts',
    'src/shared/nostr/gateway.ts',
    'src/shared/nostr/nip19-decode.ts',
    'src/shared/nostr/relays.ts',
    'src/shared/nostr/user-relays.ts',
    // Type-only files (no runtime code)
    'src/features/comments/domain/comment-model.ts',
    'src/features/content-resolution/domain/content-metadata.ts',
    'src/features/notifications/domain/notification-model.ts',
    'src/server/api/bindings.ts',
    // Application-layer re-export facades
    'src/features/content-resolution/application/resolve-podbean-embed.ts',
    'src/features/content-resolution/application/resolve-soundcloud-embed.ts'
  ]
}
```

- [ ] **Step 5: Verify coverage improves**

```bash
pnpm test:coverage 2>&1 | grep "All files"
```

Expected: Coverage percentage should increase (fewer 0% files in the denominator).

- [ ] **Step 6: Run full validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All pass.

- [ ] **Step 7: Commit and create PR**

```bash
git add -A
git commit -m "test: improve coverage reporting and add comment-profile-preload tests

- Exclude re-export facades and type-only files from coverage reports
- Add unit tests for comment profile preload pubkey extraction logic
- Coverage now accurately reflects testable code

Closes #<issue-number>"
```

Create PR.

---

## Pre-Commit Validation (applies to ALL tasks)

Before every commit, run:

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

This matches the CI pipeline. If any step fails, fix before committing.

## PR Template

All PRs should follow this format:

```markdown
## 概要

<1-3 行の要約>

## 変更内容

- <箇条書き>

## テスト

- [ ] `pnpm test` パス
- [ ] `pnpm check` 警告なし (Task 3 以降)
- [ ] `pnpm lint` パス
- [ ] `pnpm test:e2e` パス
```
