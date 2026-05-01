# @ikuradon/auftakt 入替計画

**Date:** 2026-03-30
**Status:** Approved

---

## 概要

Resonote の Nostr キャッシュ・サブスクリプション層を `@ikuradon/auftakt` に Big Bang で一括置換する。gateway.ts / event-db.ts / cached-query.svelte.ts を削除し、全 feature を1 PR で移行。

## 決定事項

| 項目                    | 決定                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| 移行方式                | Big Bang（全 feature 一括、1 PR）                                                           |
| IDB データ              | DB 名 `resonote-events` を継続使用。マイグレーション不要（リリース前）                      |
| connectStore フィルタ   | なし（Ephemeral 自動除外のみ）                                                              |
| fetchById / fetchLatest | 両方 auftakt 化。Resonote 側に `fetchLatest` ヘルパーを作成                                 |
| publish 系              | スコープ外。castSigned / pending-publishes をそのまま維持                                   |
| Comments 移行方針       | subscription 層 + キャッシュ復元を auftakt 化。view-model は events$ → Comment[] 変換に専念 |
| 他 feature              | 全 feature 一括で auftakt 化                                                                |
| テスト                  | auftakt 内部テストは auftakt リポジトリに委任。Resonote 側は統合テスト + E2E                |

---

## アーキテクチャ

```
[App Bootstrap]
  └── initSession()
        ├── const store = createEventStore({ backend: indexedDBBackend('resonote-events') })
        ├── const rxNostr = await getRxNostr()
        └── connectStore(rxNostr, store, { reconcileDeletions: true })

[Feature Layer]
  ├── comments/      → createSyncedQuery(strategy: 'dual') + events$ → Comment[]
  ├── notifications/  → createSyncedQuery(strategy: 'dual') + chunk()
  ├── profiles/       → store.fetchById() or getSync() + fetchLatest ヘルパー
  ├── bookmarks/      → fetchLatest ヘルパー (kind:10003)
  ├── follows/        → wot-fetcher は REQ 管理のみ残し Store 自動キャッシュ
  ├── emoji-sets/     → createSyncedQuery(strategy: 'backward') + chunk()
  ├── relays/         → createSyncedQuery(strategy: 'backward') or fetchLatest
  └── podcast/episode → store.fetchById() + getSync()

[Shared Layer — 変更後]
  ├── shared/nostr/store.ts             — NEW: Store シングルトン + fetchLatest + connectStore 初期化
  ├── shared/nostr/client.ts            — 既存: getRxNostr() + disposeRxNostr()
  ├── shared/nostr/publish-signed.ts    — 既存: castSigned 系そのまま維持
  ├── shared/nostr/pending-publishes.ts — 既存: そのまま維持
  ├── shared/nostr/helpers.ts           — 既存: ncontent エンコード等
  ├── shared/nostr/events.ts            — 既存: イベントビルダー
  ├── shared/nostr/relays.ts            — 既存: デフォルトリレー定義
  └── shared/nostr/user-relays.ts       — 既存: ユーザーリレー検索
```

---

## 削除対象

| ファイル                                  | 理由                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| `src/shared/nostr/event-db.ts`            | auftakt の IDB バックエンドが代替                      |
| `src/shared/nostr/cached-query.svelte.ts` | auftakt の `store.fetchById()` + reactive query が代替 |
| `src/shared/nostr/gateway.ts`             | store.ts に置換                                        |

## 新規ファイル

| ファイル                    | 内容                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `src/shared/nostr/store.ts` | auftakt Store シングルトン (`getStore()`) + `fetchLatest()` ヘルパー + `initStore()` |

---

## 新規モジュール設計: `store.ts`

```typescript
// src/shared/nostr/store.ts
import { createEventStore, type EventStore } from '@ikuradon/auftakt';
import { indexedDBBackend } from '@ikuradon/auftakt/backends/indexeddb';
import { connectStore, createSyncedQuery } from '@ikuradon/auftakt/sync';
import { firstValueFrom, filter, timeout } from 'rxjs';

let store: EventStore | undefined;

export function getStore(): EventStore {
  if (!store) throw new Error('Store not initialized. Call initStore() first.');
  return store;
}

export async function initStore(): Promise<void> {
  const { getRxNostr } = await import('./client.js');
  store = createEventStore({ backend: indexedDBBackend('resonote-events') });
  const rxNostr = await getRxNostr();
  connectStore(rxNostr, store, { reconcileDeletions: true });
}

export function disposeStore(): void {
  store?.dispose();
  store = undefined;
}

export async function fetchLatest(
  pubkey: string,
  kind: number,
  options?: { timeout?: number }
): Promise<import('nostr-typedef').Event | null> {
  const s = getStore();
  const { getRxNostr } = await import('./client.js');

  // 1. ローカルキャッシュ
  const cached = await s.getSync({ kinds: [kind], authors: [pubkey], limit: 1 });
  if (cached.length > 0) return cached[0].event;

  // 2. リレーフェッチ
  const rxNostr = await getRxNostr();
  const synced = createSyncedQuery(rxNostr, s, {
    filter: { kinds: [kind], authors: [pubkey], limit: 1 },
    strategy: 'backward'
  });
  try {
    const result = await firstValueFrom(
      synced.events$.pipe(
        filter((events) => events.length > 0),
        timeout(options?.timeout ?? 5000)
      )
    ).catch(() => null);
    return result?.[0]?.event ?? null;
  } finally {
    synced.dispose();
  }
}
```

---

## Feature 別の変更詳細

### Comments (最も複雑)

**削除:**

- `comment-subscription.ts` 内の `startSubscription()`, `startMergedSubscription()`, `startDeletionReconcile()`, `loadSubscriptionDeps()`
- `comment-subscription.ts` 自体を削除。`buildContentFilters()` は `comment-view-model.svelte.ts` にインライン化（SyncedQuery のフィルタ構築に使用）

**置換:**

- `comment-view-model.svelte.ts`:
  - `dispatchPacket` → 削除。auftakt `events$` を subscribe → Comment[] 変換
  - `pendingDeletions` → 削除（auftakt Store 内蔵）
  - `restoreFromCache` → 削除（reactive query 初回 emit がキャッシュ結果）
  - `subscriptionRefs` / `loadSubscriptionDeps()` → `createSyncedQuery()` に置換
  - `addSubscription(idValue)` → 新しい `createSyncedQuery()` を作成し `combineLatest` でマージ:
    ```typescript
    const synced2 = createSyncedQuery(rxNostr, store, {
      filter: buildContentFilters(idValue),
      strategy: 'dual'
    });
    subscriptions.push(synced2);
    // combineLatest([synced1.events$, synced2.events$.pipe(startWith([]))]) + dedup
    ```

**維持:**

- `deletion-rules.ts` — ドメインロジック（ただし view-model での手動適用は不要に。auftakt が NIP-09 処理）
- `reaction-rules.ts` — reaction 集計ロジック
- orphan parent fetch → `store.fetchById()` に差し替え
- comment-profile-preload — そのまま

### Notifications

- `notifications-view-model.svelte.ts`:
  - backward/forward の手動 subscription → `createSyncedQuery(strategy: 'dual')`
  - 100人バッチは rx-nostr `chunk()` operator で対応
  - mute フィルタは `events$` 後段で Svelte `$derived` 適用
  - `notifIds` 重複排除 → auftakt Store の dedup に委任

### Profiles

- `profile-queries.ts` → `store.getSync()` + `fetchLatest()` ヘルパーに置換
- `profile.svelte.ts` → kind:0 取得を `fetchLatest(pubkey, 0)` に

### Follows / WoT

- `wot-fetcher.ts`:
  - `eventsDB.put()` 呼び出しを削除（`connectStore` が自動保存）
  - REQ 管理（2ホップ、100人バッチ）は既存のまま
  - `getEventsDB()` import を削除

### Bookmarks

- `bookmark-actions.ts` → `fetchLatest(myPubkey, 10003)` に置換

### Emoji Sets

- `emoji-sets.svelte.ts`:
  - backward subscription → `createSyncedQuery(strategy: 'backward')`
  - 世代カウンタ → SyncedQuery の `emit()` による自動キャンセル
  - `eventsDB.put()` → 削除
  - IDB キャッシュ復元 → reactive query 初回 emit

### Podcast / Episode Resolver

- `podcast-resolver.ts` / `episode-resolver.ts`:
  - `getEventsDB()` → `getStore()` に
  - `eventsDB.getByReplaceKey()` → `store.getSync({ kinds: [39701], authors: [pubkey], '#d': [dTag], limit: 1 })`
  - `eventsDB.put()` → 削除（connectStore 自動保存）
  - リレーフェッチ → `store.fetchById()` or `createSyncedQuery(strategy: 'backward')`

### Relay Settings

- `relays.svelte.ts` → kind:10002 取得を `createSyncedQuery(strategy: 'backward')` or `fetchLatest()` に
- `relays-config.ts` → `fetchLatest()` に

---

## Bootstrap 初期化の変更

```typescript
// src/app/bootstrap/init-session.ts
// 既存: getEventsDB() でDB初期化
// 変更: initStore() で auftakt Store + connectStore 初期化

export async function initSession(): Promise<void> {
  const { initStore } = await import('$shared/nostr/store.js');
  await initStore();
  // ... 以降の初期化処理は既存のまま
}
```

Logout 時:

```typescript
export async function destroySession(): Promise<void> {
  const { disposeStore } = await import('$shared/nostr/store.js');
  disposeStore();
  // ... disposeRxNostr() 等
}
```

---

## テスト方針

| テスト                                            | 対応                                      |
| ------------------------------------------------- | ----------------------------------------- |
| `cached-query.test.ts`                            | 削除                                      |
| `comment-subscription.test.ts`                    | SyncedQuery ベースに書き換え              |
| `comment-list-view-model.test.ts`                 | events$ subscribe パターンに修正          |
| `audio-embed-view-model.test.ts`                  | 変更なし（nostr 非依存）                  |
| `cached-query.test.ts` の TTL / invalidate テスト | auftakt 側の store.test.ts (172件) に委任 |
| E2E (`e2e/*.test.ts`)                             | そのまま実行。UI 挙動不変                 |
| structure-guard                                   | import パス変更を反映                     |

---

## CLAUDE.md 更新事項

- `event-db.ts` / `cached-query.svelte.ts` / `gateway.ts` の記載を削除
- `store.ts` の記載を追加
- `@ikuradon/auftakt` を Tech Stack / Dependencies に追加
- Subscription Pattern のセクションを auftakt の `createSyncedQuery` ベースに更新
- State Management に auftakt Store のシングルトンパターンを追記

---

## リスクと対策

| リスク                                   | 対策                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Big Bang で全壊                          | E2E テストが最終ゲート。CI で lint + test + e2e 全パスを確認                        |
| auftakt のバグ                           | auftakt 172 テスト / 94% カバレッジ + review-implementation.md のブロッカー修正済み |
| IDB スキーマ不一致                       | リリース前のため旧データなし。`resonote-events` を新スキーマで初期化                |
| bundle サイズ増                          | event-db.ts + cached-query.svelte.ts 削除で相殺。`pnpm perf:bundle:summary` で確認  |
| combineLatest の複雑さ (addSubscription) | 既存パターンより行数は増えるが、手動 subscription 管理がなくなる                    |
