# auftakt Resonote Integration Design

> rx-nostr を Resonote のコードから除去し、auftakt の公開 API に一括置換する設計。
> nostr-login の rx-nostr transitive 依存は許容。

---

## 決定事項

- 移行戦略: 一括置換 (rx-nostr の直接使用を全除去)
- 起点: comments + profiles → 並行して publishing + follows/relays/mute/bookmarks/emojis
- event-db.ts: auftakt の DexiePersistentStore に統合 (キャッシュなので再取得で復旧)
- cached-query.svelte.ts: auftakt の Handle API に置換
- nostr-login: 内部 rx-nostr 依存は許容。package.json には残る

---

## サブプロジェクト構成

```
S1 Runtime bootstrap + gateway 置換 (基盤)
 ├── S2 Comments + Reactions + Notifications 移行
 ├── S3 Profiles + Follows + Relays + Mute + Bookmarks + Emojis + NIP19 + Content Resolvers 移行
 └── S4 Publishing 移行
      └── S5 Cleanup (event-db 廃止 + rx-nostr 除去 + dev-tools 対応)
```

S2/S3/S4 は S1 完了後に並行可能。S5 は全完了後。

### 注意: auftakt 公開 API の実際の形状

- `User.fromPubkey(pubkey, { runtime })` の relation は **flat** — `user.profile`, `user.follows` (`user.related.profile` ではない)
- `session.send(draft)` / `session.cast(draft)` は**両方 draft を受け取る** (cast は pre-signed ではない)
- `cast()` は fire-and-forget handle を返す (`{ status, event, progress, retry(), discard(), settled }`)
- `onPublishing` callback は公開 API に露出していない (cast 内部でのみ使用)

---

## S1: Runtime Bootstrap + Gateway 置換

### 目的

アプリ起動時に auftakt runtime を生成し、login/logout に連動して Session を開閉する。既存の gateway.ts を auftakt facade に差し替える。

### 変更ファイル

| ファイル                                     | 変更内容                                           |
| -------------------------------------------- | -------------------------------------------------- |
| `src/shared/nostr/auftakt-runtime.svelte.ts` | **新規**: Runtime singleton + Session 管理         |
| `src/app/bootstrap/init-app.ts`              | auftakt runtime 初期化を追加                       |
| `src/app/bootstrap/init-session.ts`          | Session.open / destroySession を auftakt に接続    |
| `src/shared/nostr/gateway.ts`                | auftakt facade に書き換え                          |
| `src/shared/nostr/client.ts`                 | 内部実装を auftakt に差し替え (最終的に S5 で削除) |

### auftakt-runtime.svelte.ts 設計

```typescript
// Singleton runtime (アプリ起動時に1回生成)
let runtime: ReturnType<typeof createRuntime> | undefined;
let session: Awaited<ReturnType<typeof Session.open>> | undefined;

export function initAuftaktRuntime(): ReturnType<typeof createRuntime> {
  if (runtime) return runtime;
  runtime = createRuntime({
    bootstrapRelays: DEFAULT_RELAYS,
    browserSignals: true
  });
  return runtime;
}

export function getRuntime() {
  return runtime;
}
export function getSession() {
  return session;
}

export async function openSession(signer: EventSigner) {
  if (!runtime) throw new Error('Runtime not initialized');
  session = await Session.open({ runtime, signer });
  await session.bootstrapUserRelays();
}

export async function closeSession() {
  session = undefined;
  // relay をデフォルトにリセット
}
```

### init-session.ts 連携

現在の `initSession(pubkey)` は:

1. `applyUserRelays(pubkey)` で kind:10002 fetch → `rxNostr.setDefaultRelays()`
2. profile/follows/bookmarks 等を parallel fetch

auftakt 移行後:

1. `openSession(nip07Signer())` → 内部で `session.bootstrapUserRelays()` が kind:10002 を取得
2. profile/follows 等は各 feature の Handle が store-first で取得

### gateway.ts 書き換え

gateway.ts の公開 API は維持しつつ、内部実装を auftakt に差し替え:

```typescript
// Publish
export async function castSigned(params, options?) {
  const s = getSession();
  if (!s) throw new Error('Not logged in');
  await s.send(params, options);
}

// Query
export async function fetchLatestEvent(pubkey, kind) {
  const rt = getRuntime();
  if (!rt) return null;
  const user = User.fromPubkey(pubkey, { runtime: rt });
  // kind に応じた relation を load
}

// getRxNostr() は S5 まで互換ラッパーとして残す
// getEventsDB() は S5 まで互換ラッパーとして残す
```

---

## S2: Comments + Reactions + Notifications 移行

### 目的

comment-subscription と notifications の backward + forward + merge + uniq パターンを Timeline Handle に置換。

### 変更ファイル

| ファイル                                                               | 変更内容                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| `src/features/comments/ui/comment-view-model.svelte.ts`                | Timeline Handle を使用した購読に書き換え         |
| `src/features/comments/ui/comment-subscription.svelte.ts`              | rx-nostr 依存を除去、Timeline Handle でラップ    |
| `src/features/comments/infra/comment-repository.ts`                    | event-db → PersistentStore 経由に変更            |
| `src/features/notifications/ui/notifications-view-model.svelte.ts`     | backward + forward 購読を Timeline Handle に置換 |
| `src/features/notifications/ui/notification-feed-view-model.svelte.ts` | cachedFetchById → Event.fromId に置換            |
| `src/shared/nostr/cached-query.svelte.ts`                              | S5 で削除。使用箇所を Event.fromId に置換        |

### 購読パターンの置換

**現在 (rx-nostr):**

```
createRxBackwardReq() + createRxForwardReq() → merge() → uniq() → subscribe()
```

**auftakt:**

```typescript
const timeline = Timeline.fromFilter({
  runtime,
  filter: { kinds: [1111], '#I': [contentTag] },
  backfill: { preset: 'timeline-default' }
});
await timeline.load(); // backward fetch (store → relay)
await timeline.live(); // forward subscription
// timeline.items が自動更新される
```

### cachedFetchById 置換

```typescript
// Before
const result = await cachedFetchById(eventId);

// After
const handle = Event.fromId(eventId, { runtime });
await handle.load();
const event = handle.current;
```

### Reactions

builtin:comments の `event:reactions` relation で取得:

```typescript
const eventHandle = Event.fromId(eventId, { runtime });
const reactions = eventHandle.related.reactions;
await reactions.load();
// reactions.items に kind:7 イベント
```

---

## S3: Profiles + Follows + Relays + Mute + Bookmarks + Emojis + NIP19 + Content Resolvers 移行

### 目的

`fetchLatestEvent` / `useCachedLatest` を User Handle + builtin relations に置換。NIP19 resolver と content resolver (podcast/episode) も移行。

### 変更ファイル

| ファイル                                                 | 変更内容                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/browser/profile.svelte.ts`                   | User Handle の `user:profile` relation に置換                    |
| `src/shared/browser/follows.svelte.ts`                   | `user:follows` relation に置換                                   |
| `src/shared/browser/relays.svelte.ts`                    | `user:relays` relation に置換                                    |
| `src/shared/browser/emoji-sets.svelte.ts`                | `user:custom-emojis` relation に置換                             |
| `src/features/mute/application/`                         | Timeline.fromFilter({ kinds: [10000] }) で取得                   |
| `src/features/bookmarks/application/`                    | Timeline.fromFilter({ kinds: [10003] }) で取得                   |
| `src/shared/nostr/user-relays.ts`                        | S5 で削除。`session.bootstrapUserRelays()` に統合済み            |
| `src/features/nip19-resolver/application/fetch-event.ts` | createRxBackwardReq → Event.fromId / Timeline.fromFilter に置換  |
| `src/shared/content/episode-resolver.ts`                 | getRxNostr + getEventsDB → PersistentStore + Event Handle に置換 |
| `src/shared/content/podcast-resolver.ts`                 | getRxNostr + getEventsDB → PersistentStore + Event Handle に置換 |

### パターン

```typescript
// Before
const profile = await fetchLatestEvent(pubkey, 0);

// After
const user = User.fromPubkey(pubkey, { runtime });
const profileHandle = user.profile;
await profileHandle.load();
const profile = profileHandle.current;
await profileHandle.live(); // リアルタイム更新
```

### Mute / Bookmarks

builtin に専用 relation がないため、Timeline.fromFilter で直接取得:

```typescript
const muteList = Timeline.fromFilter({
  runtime,
  filter: { kinds: [10000], authors: [pubkey], limit: 1 }
});
await muteList.load();
// muteList.items[0] が最新の mute list
```

feature 側の parse ロジック (extractMuteList, parseBookmarkTags) はそのまま維持。

---

## S4: Publishing 移行

### 目的

castSigned / publishSignedEvent / publishSignedEvents を Session API に置換。

### 変更ファイル

| ファイル                             | 変更内容                                            |
| ------------------------------------ | --------------------------------------------------- |
| `src/shared/nostr/gateway.ts`        | castSigned → session.send に内部差し替え            |
| `src/shared/nostr/publish-signed.ts` | S5 で削除。publishSignedEvent → session.cast に置換 |
| 各 feature の action ファイル        | gateway 経由なので直接変更は最小限                  |

### API 対応

| 現在                            | auftakt                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `castSigned(params, options?)`  | `session.send(draft)` — 署名 + 結果 await                              |
| `publishSignedEvent(signed)`    | `session.cast(draft)` — draft を受け取り fire-and-forget handle を返す |
| `publishSignedEvents(events[])` | `for (e of events) session.cast(draft)`                                |
| `retryPendingPublishes()`       | Session.open 時に自動実行                                              |

### 署名完了後の状態追跡

`session.cast(draft)` は handle を返し、`handle.status` で署名・送信の進捗を追跡できる:

```typescript
const handle = session.cast(draft);
// handle.status: 'signing' → 'publishing' → 'partial' → 'confirmed'
await handle.settled; // 全 relay の結果が確定するまで待つ
```

`session.send(draft)` は結果を直接 await する同期パターン。

---

## S5: Cleanup

### 削除対象

| ファイル                                  | 理由                                          |
| ----------------------------------------- | --------------------------------------------- |
| `src/shared/nostr/client.ts`              | getRxNostr() singleton → 不要                 |
| `src/shared/nostr/event-db.ts`            | IndexedDB キャッシュ → PersistentStore に統合 |
| `src/shared/nostr/cached-query.svelte.ts` | Event Handle に置換済み                       |
| `src/shared/nostr/publish-signed.ts`      | Session API に統合済み                        |
| `src/shared/nostr/user-relays.ts`         | session.bootstrapUserRelays() に統合済み      |
| `src/shared/browser/dev-tools.svelte.ts`  | getEventsDB → PersistentStore に置換          |

### package.json

```diff
- "rx-nostr": "^x.x.x",
- "@rx-nostr/crypto": "^x.x.x",
```

nostr-login が rx-nostr を transitive dependency として持つため、pnpm の hoisting で利用可能な状態は残る。Resonote のコードからの直接 import がなければ OK。

### gateway.ts 最終形

```typescript
export { castSigned, publishEvent, fetchLatestEvent } from './auftakt-runtime.svelte.js';
export type { StoredEvent, LatestEventResult, EventParameters } from './types.js';
```

getRxNostr() / getEventsDB() は削除。importers がなくなっていることを確認。

---

## 移行中の共存戦略

S1 完了後 〜 S5 完了までの間、rx-nostr と auftakt が並存する。

- gateway.ts は S1 で auftakt facade に書き換え
- ただし `getRxNostr()` は S5 まで互換のため残す (notifications 等の未移行 feature 向け)
- `getEventsDB()` も S5 まで残す
- 移行済み feature は auftakt Handle API を直接使用、未移行は gateway 経由で旧 API を使用

### リスク軽減

- S1 完了後に既存テスト (unit + E2E) が全パスすることを確認
- S2-S4 は各 feature 単位でテスト可能
- S5 は全移行後のため、削除対象に import がないことを機械的に確認可能

---

## 残存する `[未実装]` マーカー

auftakt spec.md に残る未実装項目 (今回スコープ外):

- k-tag 読み取り (TombstoneProcessor) — マイナー
- TombstoneProcessor reason 設定 — マイナー
- search in queryEvents — 意図的 not implemented
