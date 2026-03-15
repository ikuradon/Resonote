# AudioProvider 残タスク実装 Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AudioProvider/PodcastProvider の未実装部分を完成させ、Podcast エピソード再生・guid 解決・pending-publishes リトライを動作可能にする。

**Architecture:** エピソード enclosureUrl 解決は Nostr #i クエリ → API フォールバックの2段構え。音声直 URL の guid 解決はバックグラウンド非同期。pending-publishes はアプリ起動時にリトライ。

**Spec:** `docs/superpowers/specs/2026-03-15-audio-provider-design.md`

---

## 未実装一覧

| # | 機能 | 優先度 | 理由 |
|---|------|--------|------|
| A | Podcast エピソード enclosureUrl 解決 | **Critical** | エピソードページで音声が再生できない |
| B | 音声直 URL のバックグラウンド guid 解決 | Important | `audio:<url>` と `podcast:item:guid` のコメントがマージされない |
| C | Pending publishes リトライ + TTL クリーンアップ | Important | 署名済みイベントがリレーに到達しない場合がある |
| D | d タグ事前検索（TrackInput） | Nice-to-have | パフォーマンス最適化、API スキップ |

---

## File Structure

### 新規作成

| ファイル | 責務 |
|---|---|
| `src/lib/content/episode-resolver.ts` | エピソード enclosureUrl 解決（Nostr #i → API フォールバック） |

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | エピソード enclosureUrl 解決 + 音声 guid 解決 + AudioEmbed に enclosureUrl 渡し |
| `src/web/routes/+layout.svelte` | pending-publishes リトライ + TTL クリーンアップ |
| `src/lib/nostr/publish-signed.ts` | `retryPendingPublishes()` 関数追加 |

---

## Task A: Podcast エピソード enclosureUrl 解決（Critical）

### 問題

`/podcast/episode/{feedBase64}:{guidBase64}` に遷移した時、AudioEmbed の `audioSrc` が `null` になる。
- `enclosureUrl` prop は未渡し
- `contentId.platform === 'podcast'` なので `fromBase64url(contentId.id)` パスも通らない

### 解決方針

複合 ID から feedUrl + guid を取り出し、2段階で enclosureUrl を解決:
1. Nostr リレーに `#i` クエリ: `{"kinds":[39701],"authors":[SYSTEM_PUBKEY],"#i":["podcast:item:guid:<guid>"]}`
   → ヒットすれば `r` タグの最初の値（= enclosureUrl）
2. ミス → `resolveByApi(feedUrl)` → episodes から guid 一致を検索 → enclosureUrl

**Files:**
- Create: `src/lib/content/episode-resolver.ts`
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Create episode-resolver.ts**

```typescript
// src/lib/content/episode-resolver.ts
import { fromBase64url } from './url-utils.js';
import { SYSTEM_PUBKEY, resolveByApi } from './podcast-resolver.js';

/**
 * Resolve enclosureUrl for a podcast episode.
 * Tries Nostr #i query first, falls back to API.
 */
export async function resolveEpisodeEnclosure(
  feedBase64: string,
  guidBase64: string
): Promise<string | null> {
  const guid = fromBase64url(guidBase64);
  const feedUrl = fromBase64url(feedBase64);

  // 1. Try Nostr relay query
  const nostrResult = await queryNostrForEpisode(guid);
  if (nostrResult) return nostrResult;

  // 2. Fallback: API
  const apiResult = await resolveByApi(feedUrl);
  if (apiResult.episodes) {
    const match = apiResult.episodes.find((ep) => ep.guid === guid);
    if (match) return match.enclosureUrl;
  }
  if (apiResult.episode?.guid === guid) {
    return apiResult.episode.enclosureUrl;
  }

  return null;
}

async function queryNostrForEpisode(guid: string): Promise<string | null> {
  try {
    const { getRxNostr } = await import('../nostr/client.js');
    const { createRxBackwardReq, uniq } = await import('rx-nostr');
    const { firstValueFrom, timeout } = await import('rxjs');

    const rxNostr = await getRxNostr();
    const req = createRxBackwardReq();

    const event$ = rxNostr.use(req).pipe(uniq(), timeout(5000));
    req.emit({
      kinds: [39701],
      authors: [SYSTEM_PUBKEY],
      '#i': [`podcast:item:guid:${guid}`],
      limit: 1,
    });
    req.over();

    const packet = await firstValueFrom(event$).catch(() => null);
    if (!packet) return null;

    // Extract enclosureUrl from r tags (first non-feed URL)
    const rTags = packet.event.tags.filter((t: string[]) => t[0] === 'r');
    // First r tag is typically the enclosure URL
    return rTags[0]?.[1] ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Modify content page to resolve enclosureUrl**

`src/web/routes/[platform]/[type]/[id]/+page.svelte` の script セクションに追加:

```typescript
import { resolveEpisodeEnclosure } from '$lib/content/episode-resolver.js';
import { fromBase64url } from '$lib/content/url-utils.js';

let resolvedEnclosureUrl = $state<string | undefined>();

// Resolve enclosure URL for audio/podcast episodes
$effect(() => {
  resolvedEnclosureUrl = undefined;

  if (platform === 'audio') {
    // AudioProvider: decode URL directly from id
    resolvedEnclosureUrl = fromBase64url(contentIdParam);
  } else if (platform === 'podcast' && contentType === 'episode') {
    // PodcastProvider: resolve from Nostr/API
    const parts = contentIdParam.split(':');
    if (parts.length === 2) {
      resolveEpisodeEnclosure(parts[0], parts[1]).then((url) => {
        resolvedEnclosureUrl = url ?? undefined;
      });
    }
  }
});
```

テンプレートの AudioEmbed に `enclosureUrl` を渡す:

```svelte
{:else if platform === 'audio' || (platform === 'podcast' && contentType === 'episode')}
  <AudioEmbed {contentId} enclosureUrl={resolvedEnclosureUrl} />
```

- [ ] **Step 3: Run checks**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add src/lib/content/episode-resolver.ts src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Resolve enclosureUrl for podcast episodes via Nostr + API fallback"
```

---

## Task B: 音声直 URL のバックグラウンド guid 解決（Important）

### 問題

`/audio/track/{base64url}` でコメント購読は `audio:<url>` の `I` タグで開始されるが、同じエピソードに `podcast:item:guid:<guid>` で投稿されたコメントは見えない。

### 解決方針

AudioEmbed 再生開始後、バックグラウンドで API を呼び guid を解決 → `addSubscription` でコメント購読を追加。

**Files:**
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add background guid resolution for audio platform**

コンテンツページの script に追加:

```typescript
import { resolveByApi } from '$lib/content/podcast-resolver.js';
import { publishSignedEvent } from '$lib/nostr/publish-signed.js';

// Background guid resolution for audio direct URLs
$effect(() => {
  if (platform !== 'audio' || !store) return;

  const audioUrl = fromBase64url(contentIdParam);
  let cancelled = false;

  resolveByApi(audioUrl).then((data) => {
    if (cancelled) return;
    if (data.episode?.guid) {
      // Add podcast:item:guid subscription for comment merge
      store?.addSubscription(`podcast:item:guid:${data.episode.guid}`);
    }
    // Publish signed bookmark events
    if (data.signedEvents) {
      for (const ev of data.signedEvents) {
        publishSignedEvent(ev).catch(() => {});
      }
    }
  });

  return () => { cancelled = true; };
});
```

- [ ] **Step 2: Run checks**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Add background guid resolution for audio direct URLs"
```

---

## Task C: Pending publishes リトライ + TTL クリーンアップ（Important）

### 問題

`addPendingPublish()` で IndexedDB に保存されたイベントが、リレー再接続時にリトライされない。`cleanExpired()` も呼ばれない。

### 解決方針

アプリ起動時（`+layout.svelte` の `onMount`）に:
1. `cleanExpired()` で 7 日超のイベントを削除
2. `getPendingPublishes()` で残りを取得
3. 各イベントを `publishSignedEvent()` でリトライ
4. 成功したら `removePendingPublish()` で削除

**Files:**
- Modify: `src/lib/nostr/publish-signed.ts` — `retryPendingPublishes()` 追加
- Modify: `src/web/routes/+layout.svelte` — onMount でリトライ呼び出し

- [ ] **Step 1: Add retryPendingPublishes to publish-signed.ts**

```typescript
import {
  getPendingPublishes,
  removePendingPublish,
  cleanExpired,
} from './pending-publishes.js';

export async function retryPendingPublishes(): Promise<void> {
  await cleanExpired();
  const pending = await getPendingPublishes();
  for (const event of pending) {
    try {
      await publishSignedEvent(event);
      await removePendingPublish(event.id);
    } catch {
      // Leave in queue for next retry
    }
  }
}
```

- [ ] **Step 2: Call from +layout.svelte onMount**

```typescript
import { retryPendingPublishes } from '$lib/nostr/publish-signed.js';

onMount(() => {
  initAuth();
  preloadEmojiMart();
  initExtensionListener();
  // Retry pending signed event publishes
  retryPendingPublishes().catch(() => {});
});
```

- [ ] **Step 3: Run checks**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add src/lib/nostr/publish-signed.ts src/web/routes/+layout.svelte
git commit -m "Add pending-publishes retry on app startup with TTL cleanup"
```

---

## Task D: d タグ事前検索（Nice-to-have、後回し可）

### 問題

URL 入力時に毎回 API を呼ぶが、既に Nostr に kind:39701 が存在する場合はスキップできる。

### 解決方針

TrackInput の `submit()` で、`parseContentUrl()` の結果が `audio` or `podcast` の場合、Nostr d タグ検索を並行実行。ヒットすれば `/podcast/episode/` に直接遷移。

**この Task は後のイテレーションに延期可能。** API 呼び出しは正常動作しており、d タグ検索は純粋なパフォーマンス最適化。
