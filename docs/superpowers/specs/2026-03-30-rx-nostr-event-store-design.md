# @ikuradon/auftakt 設計仕様

**Date:** 2026-03-30
**Status:** Draft
**Package:** `@ikuradon/auftakt`
**Scope:** rx-nostr専用のリアクティブイベントストア

> **Auftakt**（アウフタクト）: 音楽用語で、小節の強拍の前に入る導入音。
> リレー応答（本拍）の前にキャッシュから即座にデータを返す、という役割を表す。

---

## 1. 目的

rx-nostrを使うアプリケーションが、イベントを永続化し、再描画・オフライン時に即座に表示できるようにする。

**解決する課題:**

- 同じフィルタでの繰り返しフェッチ（帯域の浪費）
- ページ遷移・リロード時のデータ消失
- 各featureで繰り返されるキャッシュ配線のボイラープレート
- Kind 5削除・Replaceable更新のクロスサブスクリプション整合性

**解決しない課題（アプリケーション層の責務）:**

- UIレイアウト・表示ロジック
- 暗号化イベントの復号
- NIP-05検証
- Pending publish（発行失敗のリトライキュー）

---

## 2. 設計判断の経緯

### なぜObservable Operatorではないか

当初 `rxNostr.use(rxReq).pipe(cacheOperator(store))` を検討したが、以下の理由で不採用:

1. **フィルタにアクセスできない** — Operatorは`EventPacket`しか受け取れず、キャッシュのクエリに必要なフィルタ情報がない
2. **Kind 5のクロスサブスクリプション問題** — あるsubscriptionで受信した削除イベントが、別subscriptionのOperatorに届かない
3. **emitの取り消し不能** — Observableはappend-only。Replaceable eventの上書きやkind 5の削除を「訂正」として表現できない

### なぜEvent Store方式か

キャッシュは本質的に**状態管理**であり、**ストリーム処理**ではない。TanStack Query / Apollo Clientと同じパターンを採用:

- rx-nostr = データソース（リレーからイベントを取得）
- Event Store = 状態の源（NIPセマンティクスに基づく保存・クエリ・更新）
- UI = Storeのリアクティブクエリに購読

### なぜrx-nostr専用か

汎用NostrイベントストアではなくRx-nostr専用とする理由:

- `createAllEventObservable()` を活用したグローバルフィード
- RxJSを前提としたリアクティブクエリ（利用者は既にRxJS依存）
- 統合ヘルパー（Sync Helper）が価値の中心であり、汎用コア単体は薄い
- 内部的にはNIPロジックとrx-nostr統合を分離し、将来の切り出しに備える

---

## 3. アーキテクチャ

```
                createAllEventObservable()
rx-nostr ──────────────────────────────────→ store.add()
     ↑                                          │
     │ REQ管理                              NostrEventStore
     │                                     (NIPセマンティクス)
     │                                          │
 SyncHelper --- emit(filter) --> store.query(filter) --> events$
     │
     └── backward complete callback ──→ EOSE検知 → status$
```

**EOSE検知方式:** `createAllMessageObservable()` によるsubIdフィルタリングではなく、BackwardReqのObservableの`complete`コールバックで検知する。subIdの紐付けが不要でシンプル。

### パッケージ構成

```
@ikuradon/auftakt
├── core/
│   ├── store.ts              # NostrEventStore本体
│   ├── nip-rules.ts          # Replaceable/Addressable/Deletion/Expiration処理
│   ├── tag-indexer.ts         # 汎用タグインデックス
│   └── negative-cache.ts     # ネガティブキャッシュ（TTL付き）
├── backends/
│   ├── memory.ts             # メモリ実装（LRU対応）
│   └── indexeddb.ts          # IndexedDB実装
├── sync/
│   ├── synced-query.ts       # createSyncedQuery
│   ├── global-feed.ts        # connectStore
│   ├── deletion-reconcile.ts # 起動時Kind 5整合性チェック
│   └── since-tracker.ts      # cache-aware since自動調整
└── adapters/
    ├── rxjs.ts               # Observable<CachedEvent[]>（デフォルト）
    └── svelte.ts             # Svelte 5 readable store
```

---

## 4. コアAPI

### 4.1 Store作成

```typescript
import { createEventStore } from '@ikuradon/auftakt';
import { indexedDBBackend } from '@ikuradon/auftakt/backends/indexeddb';
import { memoryBackend } from '@ikuradon/auftakt/backends/memory';

const store = createEventStore({
  backend: indexedDBBackend('my-app-cache')
  // or: memoryBackend()
  // or: memoryBackend({ maxEvents: 10000, strategy: 'lru' })
});
```

### 4.2 グローバルフィード接続

```typescript
import { connectStore } from '@ikuradon/auftakt/sync';

// アプリ起動時に1回。全subscriptionのイベントをStoreに流し込む
const disconnect = connectStore(rxNostr, store, {
  // オプション: 追加の保存フィルタ（Ephemeral 20000-29999 は常に除外）
  // EventPacketのrelay情報も参照可能
  filter: (event, meta: { relay: string }) => {
    if (event.kind === 4) return false; // DM除外
    return true;
  },
  reconcileDeletions: true // 起動時にkind:5整合性チェック実行
});
```

内部動作:

1. `rxNostr.createAllEventObservable()` を購読
2. 各EventPacketについて `store.add(event, { relay: packet.from })` を呼び出し
3. `reconcileDeletions: true` の場合、Store内イベントに対するkind:5をチャンク化してフェッチ

### 4.3 リアクティブクエリ

```typescript
// Observable<CachedEvent[]> を返す
const events$ = store.query({
  kinds: [1],
  authors: [pubkeyA, pubkeyB],
  limit: 50
});

// タグベースクエリ
const comments$ = store.query({
  kinds: [1111, 7, 5],
  '#I': ['youtube:video:abc123']
});
```

クエリの挙動:

- subscribe時に現在の状態を即座にemit
- Store更新時（add/delete/replace）に影響のあるクエリが再emit
- unsubscribe時にクエリは非アクティブ化（再評価対象から除外）

### 4.4 同期クエリ（SyncedQuery）

```typescript
import { createSyncedQuery } from '@ikuradon/auftakt/sync';

const {
  events$, // Observable<CachedEvent[]> — Storeからのリアクティブクエリ結果
  status$, // Observable<'cached' | 'fetching' | 'live' | 'complete'>
  emit, // (filter: LazyFilter) => void — フィルタ変更
  dispose // () => void — 購読解除・クリーンアップ
} = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [0], authors: [pubkeyA] },
  strategy: 'dual', // 'backward' | 'forward' | 'dual'
  on: { relays: ['wss://relay.example.com'] }, // オプション: リレーターゲティング（rx-nostrのonオプションをパススルー）
  staleTime: 5 * 60_000 // キャッシュがこの時間以内ならREQスキップ
});
```

#### Strategy: `'dual'`（backward + forward自動管理）

```
subscribe
  → status$: 'cached'     — Storeからキャッシュ結果をemit
  → status$: 'fetching'   — backward REQ送信（since: キャッシュ最新）
  → [EOSE到着]
  → status$: 'live'       — forward REQ開始、リアルタイム受信中
dispose()
  → 両方のsubscription解除
```

#### Strategy: `'backward'`

```
subscribe
  → status$: 'cached'     — Storeからキャッシュ結果をemit
  → status$: 'fetching'   — backward REQ送信
  → [EOSE到着]
  → status$: 'complete'   — 完了
```

#### Strategy: `'forward'`

```
subscribe
  → status$: 'cached'     — Storeからキャッシュ結果をemit
  → status$: 'live'       — forward REQ開始
```

#### フィルタ変更

```typescript
// ForwardReqのhot-swap相当
synced.emit({ kinds: [1], authors: [pubkeyB] });
// → 前回のbackward subscriptionを自動キャンセル
// → rxReqのフィルタ変更 + store.queryの再構築が同時に実行
// → events$が新フィルタの結果をemit
```

`emit()` の内部動作:

1. 進行中のbackward subscriptionがあればunsubscribe
2. `store.query(newFilter)` で新しいreactive queryを構築
3. `events$` に新クエリのキャッシュ結果をemit
4. 新しいbackward REQを送信（strategyに応じて）
5. forward REQのフィルタもhot-swap

#### dispose() のライフサイクル保証

```
dispose():
  1. backward/forward subscriptionをunsubscribe
  2. store.query()のreactive購読を解除
  3. events$ / status$ をcomplete
  4. 以降のemit()呼び出しはno-op（エラーではない）
  5. Storeのクエリ逆引きインデックスからも除去
```

### 4.5 発行ヘルパー

```typescript
import { publishEvent } from '@ikuradon/auftakt/sync';

const ok$ = publishEvent(rxNostr, store, eventParams, {
  signer: nip07Signer(),
  optimistic: true // Storeに即追加（リレー確認前にUI反映）
});
// ok$: Observable<OkPacketAgainstEvent>（rx-nostrのsend()をそのまま返す）
```

### 4.6 単一イベントフェッチ

```typescript
const event = await store.fetchById(eventId, {
  rxNostr, // キャッシュミス時にリレーにフェッチ
  relayHint: 'wss://...', // 優先リレー
  timeout: 5000,
  negativeTTL: 30_000 // 「見つからない」を30秒記憶
});
// → CachedEvent | null
```

フロー: 0. In-flightチェック → 同じIDのfetchが進行中ならそのPromiseを返す（重複REQ防止）

1. メモリキャッシュ → ヒットすれば返却
2. IndexedDB → ヒットすれば返却
3. ネガティブキャッシュチェック → TTL内なら即null
4. リレーにbackward REQ（oneshot）→ 結果をStoreに保存して返却
5. タイムアウト → ネガティブキャッシュに登録、null返却

---

## 5. NIPセマンティクス処理

### 5.1 store.add() の内部ロジック

```
add(event, meta?):
  1. Ephemeral判定 (kind 20000-29999) → 保存しない、return
  2. 重複判定 (event.id) → 既存ならrelay metadataのみ更新、return
  3. NIP-40期限チェック → 期限切れなら保存しない、return
  4. Kind 5削除処理:
     a. eタグから参照先eventIdを抽出
     b. aタグから参照先addressable eventを抽出（kind:pubkey:d-tag形式）
     c. 各参照先について:
        - eタグ: Store内で元イベントのpubkeyと削除者pubkeyの一致を検証
        - aタグ: Store内で(kind, pubkey, d-tag)に一致するイベントを検索し、
          削除イベントのcreated_at以前のものを削除済みマーク
     d. 検証NGかつ参照先がStore未到着 → pendingDeletionsに登録
        （後続のadd()で対象イベント到着時に自動検証・削除）
        理由: BackwardReqはcreated_at降順でイベントを送るため、
        kind:5が対象イベントより先に到着することが頻繁に起きる
     e. 検証NGかつ参照先が存在しpubkey不一致 → 無視
     f. 削除イベント自体も保存（起動時の再検証用）
  5. Replaceable判定 (kind 0, 3, 10000-19999):
     a. (pubkey, kind) で既存を検索
     b. 既存のcreated_at > 新着のcreated_at → 破棄
     c. created_at同一 → event ID辞書順比較、小さい方を保持
     d. 新着が新しい → 既存を置換
  6. Addressable判定 (kind 30000-39999):
     a. dタグを抽出
     b. (kind, pubkey, d_tag) で既存を検索
     c. 以降Replaceableと同じロジック
  7. Regular → そのまま保存
  8. pendingDeletionsチェック → 保存したイベントのIDがpendingにあれば削除検証を実行
  9. 影響を受けるreactive queryに通知
```

### 5.2 削除済みイベントの扱い

- Store内部に `deletedIds: Set<string>` を保持
- `store.query()` は削除済みイベントを返さない
- 削除イベント（kind:5）自体は保存する（起動時の再検証に使用）
- Addressable eventのa-tagによる削除にも対応

### 5.3 クエリ時のフィルタリング

```
query(filter):
  1. バックエンドにフィルタを渡してイベント取得
  2. 削除済みIDを除外
  3. NIP-40期限切れを除外
  4. created_at降順でソート
  5. limit適用
  6. CachedEvent[]として返却
```

---

## 6. ストレージバックエンド

### 6.1 IndexedDBバックエンド

```typescript
const backend = indexedDBBackend('my-app', {
  version: 1
});
```

**ObjectStore設計:**

```
Store: "events" (keyPath: "id")
Indexes:
  pubkey_kind:     [pubkey, kind]           — Replaceable検索
  replace_key:     [kind, pubkey, _d_tag]   — Addressable検索（kind先頭でprefix match有利）
  kind_created_at: [kind, created_at]       — タイムラインクエリ
  tag_index:       _tag_index (multiEntry)  — タグベースクエリ

Store: "metadata" (keyPath: "eventId")
  — seenOn: string[], firstSeen: number

Store: "deleted" (keyPath: "eventId")
  — deletedBy: string (kind:5 event ID), deletedAt: number

Store: "negative_cache" (keyPath: "eventId")
  — expiresAt: number
```

**タグインデックスの構築:**

```typescript
// イベント保存時に_tag_indexフィールドを生成
event._tag_index = event.tags.filter((t) => t.length >= 2).map((t) => `${t[0]}:${t[1]}`);
// multiEntryインデックスにより各タグ値で検索可能
```

**書き込みバッチ:** `queueMicrotask()` で複数のadd()を1トランザクションにまとめる。ただし2フェーズ方式を採用:

1. Regular events → 1トランザクションで一括put（比較不要）
2. Replaceable/Addressable events → 個別トランザクションでread-compare-put（既存イベントとのcreated_at比較が必要なため）

**SSR環境:** `typeof indexedDB === 'undefined'` の場合（SvelteKit SSR等）、自動的にメモリバックエンドにフォールバックする。

### 6.2 メモリバックエンド

```typescript
const backend = memoryBackend({
  maxEvents: 50000,
  eviction: {
    strategy: 'lru',
    budgets: {
      0: { max: 5000 }, // プロフィール
      1: { max: 30000 }, // ノート
      7: { max: 10000 }, // リアクション
      default: { max: 5000 }
    }
  }
});
```

**内部データ構造:**

```
byId:              Map<eventId, NostrEvent>
byKind:            Map<kind, Set<eventId>>
byAuthor:          Map<pubkey, Set<eventId>>
byReplaceableKey:  Map<"kind:pubkey", eventId>
byAddressableKey:  Map<"kind:pubkey:dtag", eventId>
byTag:             Map<"tagName:tagValue", Set<eventId>>
accessOrder:       LinkedList<eventId>  — LRU用
```

**容量超過時の削除:**

- アクティブなクエリ結果に含まれるイベントはpin（削除対象外）
- kind別バジェット枠内でLRU最古のイベントから削除
- 時間ベースTTLではなくアクセスベース（意図的な過去データ参照を妨げない）

---

## 7. Reactive Query実装

### 7.1 通知メカニズム

```
store.add(event)
  → 状態が変化したか判定（新規/置換/no-op）
  → 変化なし → return（emitしない）
  → 変化あり → pendingQueriesに追加
  → queueMicrotask()で一括再評価
```

**マイクロバッチング:** リレーからイベントがバーストで到着した場合（BackwardReqで50件一気に）、add()ごとではなくmicrotask境界で1回だけ再評価。

### 7.2 クエリ逆引きインデックス

```
kindIndex:    Map<number, Set<QueryId>>
authorIndex:  Map<string, Set<QueryId>>
wildcardSet:  Set<QueryId>  — kind/author指定なしのクエリ
```

`store.add(event)` 時に候補クエリを絞り込み:

```
candidates = wildcardSet ∪ kindIndex[event.kind] ∪ authorIndex[event.pubkey]
```

### 7.3 差分更新（v2）

MVP後の最適化。フルクエリ再実行ではなく既存結果を直接更新:

| 操作              | 差分更新                           |
| ----------------- | ---------------------------------- |
| Regular event追加 | filter判定→結果に追加→ソート→limit |
| Replaceable更新   | 同キーを探して差し替え             |
| 削除              | 結果からID除去                     |
| no-op             | 何もしない                         |

---

## 8. CachedEvent型

```typescript
interface CachedEvent {
  event: NostrEvent; // 元のNostrイベント
  seenOn: string[]; // 確認済みリレー一覧
  firstSeen: number; // 最初の受信タイムスタンプ
}
```

`EventPacket` との違い:

- `subId`, `message` は含まない（デバッグ用途は生Observable経由）
- `seenOn` は `tie()` の機能を代替（複数リレーでの確認状況）

---

## 9. 最適化戦略

### MVP（v1）

| 最適化              | 概要                                                 |
| ------------------- | ---------------------------------------------------- |
| マイクロバッチング  | add()バースト時のreactive query再評価を1回にまとめる |
| Cache-aware since   | キャッシュ最新タイムスタンプ以降のみリレーにフェッチ |
| IDB書き込みバッチ   | 複数add()を1トランザクションにまとめる               |
| IDBインデックス設計 | Resonote実証済みのcompoundインデックス               |
| no-op検知           | 状態変化なしのadd()でemitをスキップ                  |

### v2

| 最適化                     | 概要                                      |
| -------------------------- | ----------------------------------------- |
| フィルタ逆引きインデックス | 影響を受けるクエリだけを再評価            |
| 差分更新                   | フルクエリ再実行の回避                    |
| staleTime                  | キャッシュが新しければREQ送信をスキップ   |
| REQ重複排除                | 同一フィルタの複数SyncedQueryでREQを1つに |
| メモリ読み出しキャッシュ   | IndexedDB前段のLRUメモリキャッシュ        |
| kind別容量バジェット       | 容量超過時のkind優先度付きLRU削除         |

### v3

| 最適化                        | 概要                                       |
| ----------------------------- | ------------------------------------------ |
| 遅延IndexedDBハイドレーション | クエリ時に初めてIndexedDBから読み込み      |
| localStorageスナップショット  | 前回セッションの重要データを同期的に即復元 |

---

## 10. Resonoteからの移行パス

### Before（現在のResonote）

```typescript
// 各featureで繰り返されるパターン
const rxReq = createRxBackwardReq();
rxNostr
  .use(rxReq)
  .pipe(uniq())
  .subscribe({
    next: (packet) => {
      eventsDB.put(packet.event); // 手動IDB保存
      handleEvent(packet.event); // 手動状態更新
    }
  });
rxReq.emit(filters);
rxReq.over();

// 初期化時にIndexedDBから復元
const cached = await eventsDB.getByPubkeyAndKind(pubkey, 0);
// ... 手動でin-memory stateを構築 ...

// kind:5の整合性チェック（手動）
const deletions = await fetchDeletionsForIds(cachedIds);
verifyDeletionTargets(deletions, eventPubkeys);
```

### After（@ikuradon/auftakt導入後）

```typescript
// アプリ起動時に1回
const store = createEventStore({ backend: indexedDBBackend('resonote') });
connectStore(rxNostr, store, { reconcileDeletions: true });

// 各featureで
const { events$, status$ } = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [1111, 7, 5], '#I': ['youtube:video:abc'] },
  strategy: 'dual'
});
// events$: 重複排除済み、削除済み除外済み、Replaceable解決済み、ソート済み
// status$: 'cached' → 'fetching' → 'live'
```

**削減されるボイラープレート:**

- eventsDB.put() の手動呼び出し → connectStore()
- backward + forwardの手動merge → strategy: 'dual'
- kind:5の2フロー処理 → Store内部で自動
- getMaxCreatedAt() + since設定 → Sync helper自動
- Set\<id\>による重複排除 → Store.add()で自動
- 世代カウンタによるstale防止 → Reactive queryで自動

---

## 11. rx-nostr全機能との互換性

| 機能                        | 対応状況 | 備考                                                       |
| --------------------------- | :------: | ---------------------------------------------------------- |
| use() + ForwardReq          |    ✅    | SyncedQueryのstrategy: 'forward'                           |
| use() + BackwardReq         |    ✅    | SyncedQueryのstrategy: 'backward'                          |
| use() + OneshotReq          |    ✅    | store.fetchById()                                          |
| フィルタ hot-swap           |    ✅    | SyncedQuery.emit()                                         |
| send() / cast()             |    ✅    | publishEvent()ヘルパー                                     |
| createAllEventObservable    |    ✅    | connectStore()のフィードソース                             |
| createAllMessageObservable  |    —     | EOSE追跡には使用しない（backward complete callbackで代替） |
| Relay targeting (on)        |    ✅    | SyncedQueryの`on`オプションでパススルー                    |
| LazyFilter                  |    ✅    | SyncedQueryが評価してからstore.query()                     |
| NIP-42 AUTH                 |    ✅    | rx-nostr内部処理、Store非関連                              |
| Operators (uniq, tie, etc.) |    ✅    | Store機能で代替（詳細は§2参照）                            |
| dispose()                   |    ✅    | Storeはrx-nostrと独立して永続化                            |

---

## 12. レビューで不採用とした提案

以下はlumilumi/nostter/Resonoteのレビューで提案されたが、MVPには含めないと判断したもの。

| 提案                                     | 不採用理由                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `store.query()` のpostFilterコールバック | `events$.pipe(map(...))` やSvelteの`$derived`で1行で代替可能。Storeに外部状態（muteリスト等）の変更検知を持たせると複雑化する |
| `status$` へのcount/error追加            | countは`events$`から導出可能。rx-nostrが内部でリトライ/バックオフを処理するため、実際のエラー状態がほぼ発生しない             |
| `addFilter()` 動的フィルタ追加           | 複数の`createSyncedQuery`を`combineLatest`でマージすれば同等。SyncedQuery内部の状態管理の複雑化を避ける                       |
| `batchSize` チャンク分割                 | rx-nostrが既に`chunk()`/`batch()` operatorを提供。Storeの責務ではない                                                         |
| TanStack Queryアダプター                 | v2で検討。MVPではストレージ層のみ利用する形で共存可能                                                                         |
| マルチタブBroadcastChannel同期           | v2で検討。各タブ独立動作でも致命的ではない                                                                                    |
| 複数RxNostrインスタンス対応              | v2で検討。`connectStore()`を複数回呼ぶ形で対応可能                                                                            |

---

## 13. 未解決事項

1. **タグインデックスの粒度** — 全タグをインデックスすると肥大化する可能性。インデックス対象タグを設定可能にすべきか
2. **Svelteアダプターの具体的API** — Svelte 5のrunesとの統合方法の詳細設計
3. **テスト戦略** — バックエンドの抽象化によりモック可能だが、IndexedDB統合テストの環境
4. **パッケージリポジトリ** — 独立リポジトリとして`@ikuradon/auftakt`で公開

---

## 14. 変更履歴

| 日付       | 変更内容                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-30 | 初版作成                                                                                                                                                                                                                                                                                                         |
| 2026-03-30 | 3プロジェクトレビュー（lumilumi, nostter, Resonote）を反映。EOSE方式簡素化、pendingDeletions追加、replace_keyインデックス順序修正、emit()キャンセル/dispose()保証明記、connectStoreフィルタにrelay情報追加、fetchById in-flight dedup追加、SSR対応、2フェーズバッチ注記、onオプション明記。不採用項目を§12に記録 |
