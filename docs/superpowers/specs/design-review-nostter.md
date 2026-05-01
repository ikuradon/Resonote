# Design Review: @ikuradon/auftakt × nostter

**Date:** 2026-03-30
**Spec:** `@~/src/github.com/ikuradon/Resonote/docs/superpowers/specs/2026-03-30-rx-nostr-event-store-design.md`
**Target project:** nostter (SvelteKit Nostr client)

---

## 1. 現状分析: nostterのキャッシュ・イベント管理

### 1.1 現在のアーキテクチャ

nostterは**手動3層キャッシュ**を採用:

| 層  | 技術                   | 用途                                    | 特徴                        |
| --- | ---------------------- | --------------------------------------- | --------------------------- |
| L1  | Svelte writable stores | リアクティブUI描画                      | メモリのみ、リロードで消失  |
| L2  | localStorage           | replaceable events (kind 0, 3, 10002等) | 同期的、容量制限あり (~5MB) |
| L3  | IndexedDB (Dexie)      | 全イベント永続化                        | 非同期、addIfNotExistsのみ  |

### 1.2 現在の問題点（auftaktが解決しうるもの）

**P1: ボイラープレートの多さ**

- `rxNostr.use()` が **30箇所以上** に散在
- 各箇所で `.pipe(tie, uniq(), ...)` を手動構成
- `bufferTime(1000, null, 10)` + `batch()` パターンが5箇所で繰り返し
- replaceable event の `latestEach()` + `created_at` 比較 + 3層保存が各所で重複

**P2: IndexedDB活用不足**

- `EventCache` クラスは `addIfNotExists()` と `getReplaceableEvents()` の2メソッドのみ
- インデックスは `id, kind, pubkey, [kind+pubkey]` — タグベースクエリ不可
- **読み出しキャッシュとして使っていない** — リロード時にIndexedDBから復元する仕組みが限定的
- Dexieのクエリ能力をほぼ活用していない

**P3: Kind 5削除の不整合リスク**

- `deletedEventIds` / `deletedEventIdsByPubkey` はメモリ上のSetのみ
- リロード時にkind:5の整合性チェックがない
- 別subscriptionで受信した削除が他subscriptionのデータに反映されるかはタイミング依存

**P4: リロード時のデータ消失**

- Svelte storesはリロードで消失
- localStorageに保存されるのはreplaceableイベントのみ
- タイムライン（kind:1等）は毎回リレーから全再取得

**P5: Cache-aware sinceの欠如**

- `since` は `now()` またはタイムライン最古イベントから計算
- キャッシュ済みタイムスタンプを考慮しないため、既取得イベントを再フェッチ

**P6: ネガティブキャッシュなし**

- `fetchById` 相当の処理で「見つからない」結果をキャッシュしていない
- 同じevent IDへの繰り返しフェッチが発生しうる

---

## 2. auftakt導入で期待される効果

### 2.1 高い効果が見込める機能 ✅

| 機能                          | 現状の問題                             | 導入効果                                     | 優先度   |
| ----------------------------- | -------------------------------------- | -------------------------------------------- | -------- |
| **connectStore()**            | 30箇所の手動store.add()                | 全subscriptionを1箇所で自動キャッシュ        | **最高** |
| **createSyncedQuery (dual)**  | backward+forwardの手動merge            | 1メソッドでcache→fetch→liveの遷移            | **最高** |
| **NIPセマンティクスの一元化** | kind:5/Replaceable処理が散在           | store.add()内部で自動処理                    | **高**   |
| **status$**                   | ローディング状態管理なし               | 'cached'→'fetching'→'live'でUXスケルトン表示 | **高**   |
| **Cache-aware since**         | 毎回全再取得                           | キャッシュ最新以降のみフェッチ               | **高**   |
| **reconcileDeletions**        | リロード時の整合性チェックなし         | 起動時にkind:5を再検証                       | **中**   |
| **ネガティブキャッシュ**      | 存在しないイベントへの繰り返しフェッチ | TTL付きで「見つからない」を記憶              | **中**   |
| **Svelteアダプター**          | 手動でSvelte store ↔ Observable変換    | `readable`/`$state`への自動変換              | **中**   |

### 2.2 nostter固有のメリット

**a) メタデータバッチ処理の統合**

現在:

```typescript
// MainTimeline.ts — 手動バッチ
rxNostr.use(metadataReq.pipe(bufferTime(1000, null, 10), batch()))
  .pipe(tie, uniq(), latestEach(...))
  .subscribe(({ event }) => {
    storeMetadata(event);
    // + localStorage保存
    // + IndexedDB保存
  });
```

auftakt導入後:

```typescript
// connectStore()が全イベントを自動キャッシュ
// 各コンポーネントでは:
const profile$ = createSyncedQuery(rxNostr, store, {
  filter: { kinds: [0], authors: [pubkey] },
  strategy: 'backward',
  staleTime: 5 * 60_000
});
```

**b) タイムライン復元の高速化**

現在: リロード → リレーから全再取得（数秒～数十秒のブランク）
auftakt: リロード → IndexedDBから即時復元 → 差分のみリレーフェッチ

**c) seenOn (relay hint) の自動管理**

現在: カスタム`tie` operatorで手動追跡 + グローバルMap
auftakt: `CachedEvent.seenOn` として自動管理、`store.add(event, { relay })` で蓄積

---

## 3. 改善提案・懸念点

### 3.1 スペックへの改善提案 🔧

**A) Svelte 5 runes対応の明確化（未解決事項#2）**

nostterはSvelte 5を使用。アダプター設計として:

```typescript
// 提案: $state()ベースのアダプター
import { svelteAdapter } from '@ikuradon/auftakt/adapters/svelte';

// Svelte 5 runesとの統合
const { events, status } = svelteAdapter(
  createSyncedQuery(rxNostr, store, { ... })
);
// events: $state(CachedEvent[])
// status: $state<'cached' | 'fetching' | 'live' | 'complete'>
```

現在のnostterは `writable()` (Svelte 4スタイル) と Svelte 5の `$state` が混在。
auftaktが両方をサポートするか、Svelte 5 runesのみにするか明確化が必要。

**B) staleTime のイベントkind別設定**

プロフィール (kind:0) は5分でstaleでいいが、タイムライン (kind:1) は30秒以内を期待。
kind別のstaleTime設定が有用:

```typescript
createSyncedQuery(rxNostr, store, {
  filter: { kinds: [0], authors: [...] },
  strategy: 'backward',
  staleTime: { 0: 5 * 60_000, 1: 30_000, default: 60_000 },
});
```

**C) メタデータ解析の責務境界**

nostterは `Metadata` クラスでkind:0の `content` JSON を解析し、
`name`, `picture`, `nip05` 等のフィールドを抽出。
auftaktの `CachedEvent` は生の `NostrEvent` を返すため、
解析ロジックはアプリ側に残る。これは正しい判断だが、ドキュメントで明示すべき。

**D) フィルタのhot-swap時のキャッシュクリア方針**

`SyncedQuery.emit()` でフィルタ変更時:

- 既存キャッシュ結果は即座にクリアされるのか？
- 新フィルタのキャッシュ結果がある場合は即返却されるのか？
  → 仕様として明確化必要。nostterのリスト切替・検索フィルタ変更で重要。

**E) Ephemeral event (kind 20000-29999) の除外範囲**

仕様では「Ephemeral判定 → 保存しない」だが、nostterはkind 30315 (User Status) を使用。
これはAddressable (30000-39999) なので保存対象だが、
Ephemeral寄りの短命データ。TTLベースの自動削除オプションがあると良い。

**F) 容量管理: localStorage スナップショット (v3) の優先度引き上げ**

nostterは現在localStorageにreplaceableイベントを保存し、
起動時に同期的に読み出している。auftakt v3の「localStorageスナップショット」は
nostterの既存パターンと互換性が高く、v1で対応すべき。

### 3.2 nostter側で必要な変更 ⚠️

**a) Svelte store統合の全面書き換え**

現在30以上のwritable storeが個別にイベントを管理。
auftakt導入時は `store.query()` のリアクティブ結果に統一する必要あり。
→ 段階的移行戦略が必要（一括移行は非現実的）。

**段階的移行の提案:**

| Phase   | 対象                                                | 規模 |
| ------- | --------------------------------------------------- | ---- |
| Phase 1 | connectStore() 導入 + 既存ロジック維持              | 小   |
| Phase 2 | メタデータ (kind:0) を SyncedQuery に移行           | 中   |
| Phase 3 | タイムライン (HomeTimeline等) を SyncedQuery に移行 | 大   |
| Phase 4 | Action (reaction, repost) を SyncedQuery に移行     | 中   |
| Phase 5 | 旧キャッシュ層 (WebStorage, EventCache) 撤去        | 小   |

Phase 1 は既存コードを壊さずに導入可能（全イベントをStoreに流し込むだけ）。

**b) カスタムtie operatorの扱い**

nostterの `tie` は `seenOn` を `Map<string, Set<string>>` として外部公開。
auftaktの `CachedEvent.seenOn` がこれを代替するが、
既存コードの `getRelayHint()` / `getSeenOnRelays()` を
`store.getById(id).seenOn` に書き換える必要あり。

**c) Dexie → auftakt IndexedDBバックエンドへの移行**

現在のDexie `cache` DB のスキーマと auftakt の ObjectStore設計は異なる。
データ移行が必要。Dexieを auftakt内部でも使うか、生IndexedDB APIかの判断も影響。

### 3.3 懸念点 ⚠️

**1. バンドルサイズ増加**

nostterは既にrx-nostr + RxJS + Dexie + nostr-toolsが入っている。
auftaktの追加サイズが気になる（特にモバイルユーザー）。
→ tree-shakeable設計であることが重要。

**2. メモリ使用量**

現在のnostterはイベントをストリーム処理し、表示に必要なものだけメモリに保持。
auftaktはStore内に全イベントを保持するため、長時間使用時のメモリ増加が懸念。
→ メモリバックエンドのLRU + kind別バジェットが重要。

**3. createAllEventObservable() の存在確認**

auftaktのconnectStore()は `rxNostr.createAllEventObservable()` に依存。
rx-nostr 3.6.1にこのAPIが存在するか要確認。
存在しない場合、各 `use()` 呼び出しの結果を個別にStore.add()する
フォールバックが必要。

**4. 既存テストへの影響**

nostterにどの程度テストがあるか不明だが、
rx-nostrのObservableに直接subscribeするテストは書き換えが必要になる。

---

## 4. nostter固有の追加ニーズ

auftaktスペックにない、nostterが必要とする機能:

### 4.1 Mute/Filter統合

nostterは `mutePubkeys`, `muteEventIds`, `muteWords` でフィルタリング。
`store.query()` にmute条件を渡せると便利:

```typescript
store.query({
  kinds: [1],
  exclude: {
    authors: $mutePubkeys,
    ids: $muteEventIds,
    contentPattern: $muteWords
  }
});
```

ただしこれはアプリ層の責務でもある。auftaktに入れるべきか要議論。

### 4.2 Notification管理

nostterは通知用のfilteredイベントストリームを維持。
`#p` タグベースのクエリが必要:

```typescript
store.query({
  kinds: [1, 6, 7, 9735],
  '#p': [myPubkey],
  since: lastReadAt
});
```

auftaktのタグインデックスでこれは対応可能（§6.1の `tag_index`）。

### 4.3 Reaction/Repost集計

nostterは「自分がリアクション/リポスト済みか」を追跡。
`store.query({ kinds: [7], authors: [myPubkey], '#e': [targetEventId] })`
が効率的に動く必要がある。複合タグクエリのパフォーマンスが重要。

### 4.4 ハッシュタグフォロー

nostterは `#t` タグでハッシュタグタイムラインを構成。
`store.query({ kinds: [1], '#t': ['nostr', 'bitcoin'] })` が必要。

---

## 5. 総合評価

### 導入推奨度: ⭐⭐⭐⭐ (5段階中4)

**導入すべき理由:**

1. ボイラープレート大幅削減（30箇所→数箇所）
2. リロード時のデータ即時復元（UX大幅改善）
3. NIPセマンティクス処理の一元化（バグ削減）
4. Cache-aware sinceによる帯域節約
5. status$によるローディングUXの統一

**慎重にすべき理由:**

1. 移行コストが大きい（段階的移行必須）
2. Svelte 5 runesとの統合設計が未確定
3. createAllEventObservable()のAPI存在確認が必要
4. メモリ使用量の増加リスク

### 推奨アクション

1. **即座に**: rx-nostr 3.x の `createAllEventObservable()` API存在確認
2. **Phase 1**: connectStore() のみ導入し、既存コードと並行運用して効果測定
3. **Phase 2以降**: 効果確認後にSyncedQueryへの段階的移行
4. **並行**: Svelteアダプターの設計をnostter側のニーズで主導

---

## 6. 追加分析: 深掘り調査で判明した事項

### 6.1 createAllEventObservable() の存在問題 🚨

**結論: rx-nostr 3.6.1に `createAllEventObservable()` は存在しない可能性が高い。**

nostterのコードベースでは `createAllMessageObservable()` のみ使用が確認された（MainTimeline.ts:128）。
`createAllEventObservable()` のインポートや使用は一切見つからなかった。

```typescript
// nostterで実際に使われているAPI
const observable = rxNostr.createAllMessageObservable();
observable.pipe(filterByType('NOTICE')).subscribe(...);
observable.pipe(filterByType('CLOSED')).subscribe(...);
```

**auftaktスペックへの影響:**

- `connectStore()` の設計前提が崩れる
- 代替案1: `createAllMessageObservable()` + `filterByType('EVENT')` でイベントを抽出
- 代替案2: 各 `rxNostr.use()` 呼び出しの戻り値に `.pipe(tap(e => store.add(e)))` を挿入するラッパー関数
- 代替案3: rx-nostrにPR を出して `createAllEventObservable()` を追加

これはauftaktの根幹に関わるため、**実装前に必ず確認が必要。**

### 6.2 EventItem抽象レイヤーの存在

nostterはイベントを `EventItem` クラスでラップしている（`Items.ts`）:

```typescript
class EventItem {
  event: NostrEvent;
  replyToPubkeys: string[]; // NIP-10 'p'タグから抽出
  replyToId: string | undefined; // reply marker → root fallback
}

class ZapEventItem extends EventItem {
  // lazy-loaded: zap request event + invoice amount
}
```

**auftaktとのギャップ:**

- auftaktの `CachedEvent` は `{ event, seenOn, firstSeen }` のみ
- `EventItem` の `replyToId` / `replyToPubkeys` 計算はアプリ層の責務
- しかし、`store.query()` の結果を `EventItem[]` に変換するアダプターが必要
- `CachedEvent → EventItem` の変換コストが毎回発生する懸念

**提案:** `store.query()` にマッピング関数を渡せるオプション:

```typescript
store.query({
  kinds: [1],
  map: (cached) => new EventItem(cached.event)
});
```

### 6.3 fetchMinutes() 適応的時間窓

nostterはフォロイー数に応じてbackward fetchの時間窓を動的調整:

```typescript
export const fetchMinutes = (numberOfPubkeys: number): number => {
  if (numberOfPubkeys < 10) return 24 * 60; // 24時間
  if (numberOfPubkeys < 25) return 12 * 60; // 12時間
  if (numberOfPubkeys < 50) return 60; //  1時間
  return 15; // 15分
};
```

**auftaktのSyncedQueryへの影響:**

- `strategy: 'backward'` のREQ発行時に、この適応ロジックをどこに置くか
- SyncedQueryが内部で `since` を計算する場合、フォロイー数を知る必要がある
- `cache-aware since` と `fetchMinutes()` の組み合わせが必要

**提案:** SyncedQueryの `since` 計算をカスタマイズ可能にする:

```typescript
createSyncedQuery(rxNostr, store, {
  filter: { kinds: [1], authors: followees },
  strategy: 'dual',
  sinceStrategy: (cacheNewest, filterAuthorsCount) => {
    const minutes = fetchMinutes(filterAuthorsCount);
    return Math.max(cacheNewest, now() - minutes * 60);
  }
});
```

### 6.4 ReplayHomeTimeline（タイムライン再生機能）

nostter固有の機能で、過去のタイムラインを速度調整しながら再生する:

- `sinceDate` からbackward REQで5分チャンクずつ取得
- `speed` (1x～10x) に応じてsetTimeoutで各イベントの表示タイミングを制御
- イベントの `created_at` をリアルタイムクロックにマッピング

**auftaktとの関係:**

- この機能はauftaktの恩恵を最も受ける — キャッシュ済みイベントは再フェッチ不要
- `store.query({ kinds: [1], authors: followees, since, until })` で即座にキャッシュから取得
- リレーへのREQは差分のみ
- ただし、SyncedQueryの `strategy` にはReplayパターンがない（backward + 時間スライス）

### 6.5 Relay Targeting と SyncedQuery

nostterの `PublicTimeline` はリレー固定:

```typescript
rxNostr.use(req, { on: { relays: this.#relays } });
```

**auftaktスペックの不足:** SyncedQueryにリレーターゲティングオプションがない:

```typescript
// 必要なAPI
createSyncedQuery(rxNostr, store, {
  filter: { kinds: [1] },
  strategy: 'forward',
  on: { relays: ['wss://relay.example.com'] } // ← これが必要
});
```

スペック§11では「Relay targeting (on) ✅ SyncedQueryオプションでパススルー」とあるが、
具体的なAPI設計が記載されていない。

### 6.6 Multi-Tab問題

**現状:** nostterはクロスタブ通信なし（BroadcastChannel / SharedWorker未使用）。

**auftakt導入時の懸念:**

- Tab Aで受信した kind:5 削除がTab BのStore には反映されない
- 同じリレーへの重複接続（タブ数 × 接続数）
- IndexedDB書き込み競合（Dexie のトランザクション分離で安全だが非効率）

**提案:** auftaktにオプショナルなcross-tab syncレイヤーを検討:

```typescript
const store = createEventStore({
  backend: indexedDBBackend('my-app'),
  crossTabSync: true // BroadcastChannel経由でStore変更を他タブに通知
});
```

### 6.7 PWA / オフライン対応

nostterにはService Workerがあるが、**静的アセットのキャッシュのみ**。
タイムラインデータのオフライン表示機能はない。

**auftaktによるオフライン改善:**

- IndexedDBに永続化されたイベントをオフラインでも表示可能
- `status$: 'cached'` 状態でUI描画 → オフラインでも前回セッションの内容を表示
- Service Workerとの連携は不要（IndexedDBは直接アクセス可能）

これはnostterにとって大きなUX改善になりうる。

### 6.8 filterAsync() と非同期フィルタリング

nostterは暗号化コンテンツの判定に非同期フィルタリングを使用:

```typescript
// PeopleLists.ts
.pipe(
  filterByKind(Kind.Followsets),
  filterAsync(({ event }) => isPeopleList(event))  // NIP-44復号チェック
)
```

**auftaktへの影響:**

- `store.query()` は同期的なフィルタのみ対応（スペックの現状）
- 暗号化イベントのフィルタリングはアプリ層で行う必要がある
- `store.query()` の結果Observableに `.pipe(filterAsync(...))` を追加する形で対応可能
- ただし、リアクティブクエリの再評価時にもasyncフィルタが必要になる場面がある

### 6.9 IndexedDB エラーハンドリングの欠如

nostterの現在のEventCacheには **try/catch がない**:

```typescript
// cache/db.ts — エラー未処理
async addIfNotExists(event: Event): Promise<void> {
  await this.db.transaction('rw', [this.db.events], async () => {
    const cachedEvent = await this.db.events.get(event.id);
    if (cachedEvent === undefined) {
      await this.db.events.add(event);
    }
  });
}
```

**auftaktへの要件:**

- QuotaExceededError（容量超過）時のグレースフルデグラデーション
- IndexedDB非対応環境（プライベートブラウジング等）でのメモリフォールバック
- トランザクション失敗時のリトライ戦略

**提案:** バックエンドにエラーポリシーを設定可能に:

```typescript
const store = createEventStore({
  backend: indexedDBBackend('my-app', {
    onQuotaExceeded: 'evict-lru', // or 'fallback-memory' or 'throw'
    onError: (error) => console.warn('[auftakt]', error)
  })
});
```

### 6.10 テスト資産の存在

nostterには **9つのテストファイル** が存在（vitest + Playwright）:

- `Content.test.ts`, `Array.test.ts`, `User.test.ts`, `List.test.ts`, `Twitter.test.ts`
- `cache/db.test.ts` — **IndexedDBキャッシュのテストあり**
- `EventHelper.test.ts`

**auftakt移行時の影響:**

- `cache/db.test.ts` は書き換えが必要（EventCache → auftakt Store）
- 他のテストは直接影響なし（ユーティリティ関数のテスト）
- auftakt自体のテストはfake-indexeddbなどが必要（スペック未解決事項#3）

### 6.11 @rust-nostr/nostr-sdk の役割

nostterは `@rust-nostr/nostr-sdk` (WASM) をWeb Worker内でイベント署名検証に使用:

```typescript
// Worker.ts
import { Event as EventWrapper, loadWasmSync } from '@rust-nostr/nostr-sdk';
loadWasmSync();
const verifier = async (event) => EventWrapper.fromJson(JSON.stringify(event)).verify();
```

**auftaktとの関係:**

- 検証はrx-nostr内部で完了するため、auftaktのstore.add()時には検証済みイベントが渡される
- auftakt内部での再検証は不要（パフォーマンス上重要）
- ただし、IndexedDBから復元したイベントの検証ポリシーは要検討
  - 信頼済み（自分のDBから読んだ）として検証スキップ？
  - それとも起動時に再検証？

### 6.12 暗号化コンテンツとキャッシュのセキュリティ

nostterはNIP-04 / NIP-44の暗号化を広範に使用:

- **NIP-51リストの暗号化private tags** — Mute list (kind 10000), People lists (kind 30000), Bookmarks (kind 30001) がcontent内に暗号化済みpubkeysを持つ
- **DM** — Kind 4は明示的にキャッシュ対象外だが、フィルタで除外しなければconnectStore()が取り込む

**auftaktへのセキュリティ要件:**

- 暗号化イベントをIndexedDBに平文で保存してよいか？（復号後のキャッシュ問題）
- nostterは暗号化コンテンツを**復号せずにそのまま保存**し、表示時に都度復号している → auftaktも同方針が安全
- `connectStore()` のフィルタで `event.kind !== 4` を指定すべき（スペック§4.2の例と一致）
- デバイス紛失時のリスク: IndexedDBに大量のイベントが保存される → ブラウザのストレージクリアがユーザーの唯一の保護手段

**提案:** センシティブイベントのキャッシュポリシー設定:

```typescript
connectStore(rxNostr, store, {
  filter: (event) => {
    if (event.kind === 4) return false; // DM除外
    if (event.kind >= 20000 && event.kind < 30000) return false; // Ephemeral除外
    return true;
  },
  // オプション: 暗号化コンテンツを持つkindのTTL
  ttlByKind: { 10000: 24 * 60 * 60_000 } // Mute listは24時間で期限切れ
});
```

### 6.13 NIP-11 max_subscriptions制限との衝突

nostterは `Nip11Registry.setDefault({ limitation: { max_subscriptions: 20 } })` を設定。

**auftaktの影響:**

- `connectStore()` が `createAllEventObservable()` (または代替) で1つのサブスクリプションを使用
- 各 `createSyncedQuery()` がbackward/forward REQを作成
- 20サブスクリプション制限に達するリスク:
  - HomeTimeline (forward 1 + backward N)
  - メタデータ (backward)
  - 通知 (forward 1)
  - リアクション/リポスト (backward)
  - 各種replaceable event (backward)

**提案:** SyncedQueryにサブスクリプション共有オプション:

```typescript
// 同じフィルタkindのSyncedQueryがREQを統合
createSyncedQuery(rxNostr, store, {
  filter: { kinds: [0], authors: pubkeys },
  deduplicateReq: true // 既存REQと統合可能なら統合
});
```

### 6.14 eventsStore の無制限増加

nostterの `eventsStore` (内部配列) にはサイズ上限がない。
表示は `maxTimelineLength = 50` に制限されるが、ページング用に全イベントをメモリ保持。

**auftaktが解決する点:**

- メモリバックエンドのLRU + kind別バジェットで自動管理
- IndexedDBバックエンドへの永続化により、メモリから削除しても復元可能
- `store.query({ limit: 50 })` で表示分のみ取得、ページングは `since/until` で実現

**ただし、nostter側の変更が必要:**

- 現在の `eventsStore` 全量保持 → `store.query()` のリアクティブ結果に変更
- `newer()` / `older()` の実装を `store.query({ until: oldestEvent.created_at })` に変更

### 6.15 SSR / Cloudflare Workers環境での制約

nostterは `@sveltejs/adapter-cloudflare` でデプロイ。SSRが有効。

**auftaktの制約:**

- IndexedDBはブラウザ専用API → SSR時に使用不可
- `createEventStore()` は `browser` チェック付きで初期化する必要あり:

```typescript
import { browser } from '$app/environment';

const store = browser
  ? createEventStore({ backend: indexedDBBackend('nostter') })
  : createEventStore({ backend: memoryBackend() }); // SSR用ダミー
```

- `connectStore()` / `createSyncedQuery()` もクライアント専用
- SSR時のデータフェッチにはauftaktは使えない（そもそもSSRでリレー接続しない設計が正しい）

### 6.16 NIP-42 AUTH状態とキャッシュ整合性

nostterは `authenticator: 'auto'` でNIP-42 AUTHに自動対応。

**懸念:**

- AUTH前後でリレーが返すイベントが異なる可能性がある
- AUTH前にキャッシュした「イベントなし」が、AUTH後も有効として扱われるリスク
- ネガティブキャッシュのTTLがこれを緩和するが、AUTH状態変更時にネガティブキャッシュのinvalidationが理想

### 6.17 NIP-40 イベント有効期限の部分的対応

nostterは **User Status (kind 30315) でのみ** `isExpired()` チェックを実施:

```typescript
// UserStatus.ts
filter(({ event }) => !isExpired(event));
```

一般タイムラインイベントではexpiration チェックなし。

**auftaktの利点:**

- スペック§5.1 step 3で `NIP-40期限チェック → 期限切れなら保存しない` を一元処理
- 既存キャッシュの期限切れイベントもquery時に除外 (§5.3 step 3)
- nostterが個別に `isExpired()` を呼ぶ必要がなくなる

### 6.18 Bookmark/Mute操作のQueue統合

nostterはBookmark・Mute・Interest操作に **Queue** パターンを使用:

```typescript
// Bookmark.ts
const queue = new Queue<{ event: Event; id: string }>();
queue.enqueue({ event, id: eventId });
// → 順次処理で競合回避
```

**auftaktの `publishEvent()` との関係:**

- `publishEvent()` のoptimistic updateは即時Store反映
- しかし、Queue経由で発行する場合、Storeへの反映タイミングの整合が必要
- 提案: `publishEvent()` にQueue/バッチ対応オプション、またはQueue側からstore.add()を明示呼び出し

### 6.19 未使用依存: async-lock

`async-lock` がpackage.jsonに存在するがコード内で使用されていない。
auftakt移行時のクリーンアップ候補。

### 6.20 Svelte 5移行の途中状態

| レイヤー         | 現在の状態管理                       | 影響                                |
| ---------------- | ------------------------------------ | ----------------------------------- |
| Timeline classes | `$state.raw` / `$derived` (Svelte 5) | auftaktアダプターは$state対応が必要 |
| グローバルstores | `writable()` (Svelte 4スタイル)      | 移行期間中は両方サポートが必要      |
| 永続化stores     | `svelte-persisted-store`             | auftaktのIndexedDB永続化で代替可能  |

**auftaktアダプター設計への影響:**

- `adapters/svelte.ts` は `readable()` (Svelte 4) と `$state` (Svelte 5) の両方を出力できるべき
- または、Observable → `readable()` の変換のみ提供し、`$state` への変換はアプリ側で `toStore()` 等のユーティリティを使用

---

## 8. 更新版スペック (auftakt/docs/design.md) との照合

### 8.1 前回レビュー指摘の反映状況

| 指摘                                          | ステータス  | スペックでの対応                                                                         |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| §3.1D emit() hot-swap時のキャッシュクリア方針 | ✅ 解決     | §4.4に5ステップの内部動作を明記。前回backward auto-cancel + 新フィルタのキャッシュ即返却 |
| §6.5 Relay Targeting                          | ✅ 解決     | §4.4 `on: { relays: [...] }` オプション明記                                              |
| §6.15 SSR対応                                 | ✅ 解決     | §6.1 `typeof indexedDB === 'undefined'` で自動メモリフォールバック                       |
| §6.6 Multi-tab問題                            | ⏳ v2送り   | §12に理由付きで記載。「各タブ独立動作でも致命的ではない」                                |
| §6.13 REQ重複排除                             | ⏳ v2送り   | §9 v2最適化に記載                                                                        |
| §6.2 EventItemマッピング                      | ❌ 不採用   | §12: `events$.pipe(map(...))` で代替可能                                                 |
| §4.1 Mute/Filter統合                          | ❌ 不採用   | §12: `postFilter` 不採用。`$derived` で代替                                              |
| §3.1A Svelte 5 runes                          | 🔲 未解決   | §13 未解決事項#2に残存                                                                   |
| §3.1B kind別staleTime                         | 🔲 未対応   | スペックに記載なし                                                                       |
| §3.1F localStorageスナップショット優先度      | 🔲 v3のまま | §9 v3に残存                                                                              |
| §6.3 fetchMinutes/sinceStrategy               | 🔲 未対応   | スペックに記載なし                                                                       |
| §6.9 IDBエラーハンドリング                    | 🔲 未対応   | スペックに記載なし                                                                       |
| §6.12 暗号化コンテンツセキュリティ            | 🔺 部分対応 | §4.2の`filter`でDM除外例あり。ttlByKindは未対応                                          |
| §6.16 NIP-42 AUTH後のキャッシュ整合性         | 🔲 未対応   | —                                                                                        |
| §6.18 Queue統合                               | 🔲 未対応   | —                                                                                        |
| §6.20 Svelte 4/5混在                          | 🔲 未解決   | §13 #2に包含                                                                             |

### 8.2 更新版スペックの新規追加事項の評価

**A) pendingDeletions（§5.1 step 4d-4e）— 優れた追加 ✅**

BackwardReqは `created_at` 降順でイベントを送るため、kind:5が対象より先に到着する問題を解決。

```
kind:5 到着 → 対象イベント未到着 → pendingDeletionsに登録
→ 対象イベント到着（step 8） → 自動検証・削除
```

**nostterへの影響:** 現在のnostterはこの順序問題を処理していない（kind:5受信時にStoreにある対象のみ削除）。auftaktで自動解決される。

**懸念:** pendingDeletionsの肥大化。対象イベントが到着しない場合のクリーンアップが必要。
→ **提案:** pendingDeletionsにTTL（例: 5分）を設定し、古いエントリを自動削除。

**B) 2フェーズIDBバッチ（§6.1）— 実用的 ✅**

Regular eventsは比較不要で一括put、Replaceable/Addressableは個別read-compare-put。

**nostterにとって:** HomeTimelineのバックワードフェッチで大量のkind:1が到着するケースで効果大。Replaceable (kind:0, 3等) は個別処理だが、これらは件数が少ないので問題なし。

**C) EOSE検知をbackward complete callbackで（§3 アーキテクチャ）— 簡素化 ✅**

`createAllMessageObservable()` によるsubIdフィルタリングを廃止し、BackwardReqのObservable完了で検知。

**nostterへのメリット:** nostterのHomeTimelineも既にcomplete callbackでEOSEを検知しているため、設計が自然に合致。

**D) dispose()のライフサイクル保証（§4.4）— 重要な追加 ✅**

5ステップの明確な保証。特にstep 4「以降のemit()はno-op」が重要。
nostterのSvelteコンポーネントのonDestroyでdispose()を安全に呼べる。

**E) connectStore()のfilterにrelay情報（§4.2）— 有用 ✅**

`filter: (event, meta: { relay: string }) => boolean` でリレー別のフィルタリングが可能に。

**nostterでの活用例:**

```typescript
connectStore(rxNostr, store, {
  filter: (event, { relay }) => {
    // 特定リレーからのkind:1のみキャッシュ
    if (event.kind === 1 && !trustedRelays.includes(relay)) return false;
    return true;
  }
});
```

**F) fetchById in-flight dedup（§4.6 step 0）— 重要 ✅**

同一IDのfetchが進行中ならそのPromiseを返す。nostterのスレッド表示で同じイベントを複数コンポーネントが要求するケースで効果大。

### 8.3 更新版で新たに発生した懸念事項

**N1: `createAllEventObservable()` は依然アーキテクチャ図と§4.2に記載**

更新版スペック§3のアーキテクチャ図と§4.2内部動作にまだ `createAllEventObservable()` が記載されている。§12の不採用リストにも代替案の記載がない。

→ **確認必要:** rx-nostrに `createAllEventObservable()` が実装済みか、これから実装されるのか。スペック著者(@ikuradon)がrx-nostrにPRを出す予定なのかもしれない。

**N2: pendingDeletionsのメモリリーク**

pendingDeletionsに登録された削除要求の対象イベントが永遠に到着しない場合、Mapが無限に成長する。

**提案:**

```typescript
// pendingDeletions: Map<eventId, { deletionEvent, registeredAt }>
// 定期クリーンアップ（例: 5分ごと）
setInterval(() => {
  const threshold = Date.now() - 5 * 60_000;
  for (const [id, entry] of pendingDeletions) {
    if (entry.registeredAt < threshold) pendingDeletions.delete(id);
  }
}, 60_000);
```

**N3: store.query()のsince/until/idsサポートが不明確**

スペック§4.3のquery例は `kinds`, `authors`, `limit`, `'#I'` のみ。nostterのページネーションに必要な `since`/`until` の対応が不明:

```typescript
// nostterのolder()パターン:
store.query({
  kinds: [1],
  authors: followees,
  until: oldestVisibleEvent.created_at, // ← これが必要
  limit: 25
});
```

`ids` フィルタも必要（スレッド表示で特定イベントIDの一括取得）:

```typescript
store.query({ ids: [eventId1, eventId2, eventId3] });
```

→ **確認必要:** `store.query()` がNostr filterフォーマットのフルセット (`ids`, `since`, `until`, `#e`, `#p` 等) をサポートするか。

**N4: staleTimeの判定基準が不明**

`staleTime: 5 * 60_000` は「キャッシュがこの時間以内ならREQスキップ」とあるが:

- 何の時間を基準にするのか？ `CachedEvent.firstSeen`？ 最後のREQ完了時刻？
- SyncedQueryのフィルタが `{ kinds: [0, 3, 10002], authors: [pubkey] }` の場合、
  kind:0は5分前にfetch済み、kind:3は30分前 → staleTime判定はkind別か全体か？

nostterでは `getCachedAt()` でキャッシュ全体のタイムスタンプを管理しているが、
kind別の粒度がないため不正確。auftaktがここを改善すべき。

**N5: Replaceable event置換時のreactive query通知の整合性**

§5.1 step 5dで「新着が新しい → 既存を置換」の場合:

- `events$` は既存イベントが新着に差し替わった状態でemitされるか？
- それとも「既存削除 + 新着追加」の2回emitになるか？

nostterではkind:0の更新がUIに即反映される必要がある。マイクロバッチング（§7.1）が2操作を1emitにまとめるなら問題ないが、明記が必要。

**N6: 不採用理由の一部に異議あり**

§12の不採用項目について:

| 提案                    | 不採用理由                      | nostter視点の評価                                                                                          |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `postFilter`            | `events$.pipe(map(...))` で代替 | ✅ 妥当。nostterではSvelteの `$derived` で十分                                                             |
| `status$` のcount/error | countは導出可能                 | ✅ 妥当                                                                                                    |
| `addFilter()`           | `combineLatest` で代替          | ⚠️ nostterの通知タイムラインは複数kindを動的に追加する。`combineLatest` は使えるがボイラープレートが増える |
| `batchSize`             | rx-nostrの `chunk()`/`batch()`  | ✅ 妥当。nostterの既存パターンと一致                                                                       |
| Multi-tab sync          | v2                              | ⚠️ nostterユーザーは複数タブを開くことが多い。v2待ちは許容だが優先度は上げたい                             |
| 複数RxNostrインスタンス | v2                              | ✅ 妥当。nostterは単一インスタンス                                                                         |

---

## 9. 残存する未解決事項（最終版）

### 最優先（ブロッカー）

| #   | 項目                                                  | 理由                                           |
| --- | ----------------------------------------------------- | ---------------------------------------------- |
| B1  | `createAllEventObservable()` のAPI確認                | connectStore()の実装前提                       |
| B2  | `store.query()` の `since`/`until`/`ids` サポート確認 | nostterのページネーション・スレッド表示に必須  |
| B3  | staleTime判定基準の明確化                             | kind混在フィルタでの正しいキャッシュ判定に必要 |

### 高優先（MVP品質に影響）

| #   | 項目                                      | nostterでの影響                            |
| --- | ----------------------------------------- | ------------------------------------------ |
| H1  | pendingDeletionsのTTL/クリーンアップ      | メモリリーク防止                           |
| H2  | IDBエラーハンドリング（QuotaExceeded等）  | ヘビーユーザーで容量超過時のクラッシュ防止 |
| H3  | Replaceable置換時のreactive query通知方式 | プロフィール更新がUIに即反映されるか       |
| H4  | Svelteアダプター ($state / writable) 設計 | nostterのSvelte 5移行途中状態に対応        |

### 中優先（v1後半またはv2）

| #   | 項目                                            | nostterでの影響                  |
| --- | ----------------------------------------------- | -------------------------------- |
| M1  | kind別staleTime                                 | profile=5min, timeline=30sec     |
| M2  | sinceStrategy カスタマイズ                      | fetchMinutes()の適応ロジック統合 |
| M3  | localStorageスナップショット優先度引き上げ      | 既存パターンとの互換性           |
| M4  | NIP-42 AUTH後のネガティブキャッシュinvalidation | AUTH依存リレーでの整合性         |
| M5  | Queue/バッチ発行とoptimistic updateの整合       | Bookmark/Mute操作                |

---

## 10. 総合評価（最終版）

### 導入推奨度: ⭐⭐⭐⭐☆ → ⭐⭐⭐⭐⭐ (4→4.5に上方修正)

**上方修正の理由:**

- emit()/dispose()のライフサイクルが明確化され、Svelteコンポーネントとの統合が安全に
- pendingDeletionsでBackwardReq順序問題が解決（nostterが現在処理できていない問題）
- SSR自動フォールバックでnostterのCloudflare環境が考慮済み
- relay targetingの`on`オプションでPublicTimeline対応が確認
- 前回指摘の多くが反映済みまたは明確な理由付きで不採用判断

**残る0.5の減点理由:**

- `createAllEventObservable()` の実在確認がまだ未完了
- `store.query()` のフルフィルタサポート（since/until/ids）が不明確
- IDBエラーハンドリングが未設計

**リスク一覧（更新版反映後）:**

| #          | リスク                                   | 重要度    | 対策                            | 前回比           |
| ---------- | ---------------------------------------- | --------- | ------------------------------- | ---------------- |
| R1         | `createAllEventObservable()` の不存在    | 🔴 致命的 | API確認 → 代替設計              | 変更なし         |
| R2         | `store.query()` のsince/until未対応      | 🔴 致命的 | スペック確認                    | **新規**         |
| R3         | pendingDeletionsメモリリーク             | 🟡 高     | TTL追加                         | **新規**         |
| R4         | 暗号化コンテンツのキャッシュセキュリティ | 🟡 高     | filter対応済み、ttlByKind未対応 | 軽減             |
| R5         | IDBエラーハンドリング欠如                | 🟡 高     | グレースフルデグラデーション    | 変更なし         |
| R6         | Svelte 4/5混在のアダプター対応           | 🟡 中     | 未解決事項#2                    | 変更なし         |
| R7         | NIP-11 max_subscriptions超過             | 🟠 中     | v2 REQ統合                      | 軽減(v2送り妥当) |
| R8         | Multi-tab Store不整合                    | 🟠 中     | v2 BroadcastChannel             | 軽減(v2送り妥当) |
| R9         | eventsStore無制限増加の移行              | 🟠 中     | LRU + limit query               | 変更なし         |
| R10        | NIP-42 AUTH後のキャッシュ整合性          | 🟠 低     | ネガティブキャッシュTTL         | 変更なし         |
| ~~R5~~     | ~~SSR環境でのIndexedDB非対応~~           | ~~解決~~  | 自動メモリフォールバック        | **解決**         |
| ~~R6前回~~ | ~~EventItem統合コスト~~                  | ~~解決~~  | `events$.pipe(map(...))`        | **解決**         |

**メリット一覧（全調査統合）:**

| # | メリット | 効果 |
| M1 | ボイラープレート削減 (30箇所→数箇所) | 🟢 非常に高い |
| M2 | リロード時データ即時復元 | 🟢 非常に高い |
| M3 | NIPセマンティクス一元化 (kind:5, Replaceable, NIP-40) | 🟢 高い |
| M4 | Cache-aware since + fetchMinutes()で帯域節約 | 🟢 高い |
| M5 | status$によるローディングUX統一 | 🟢 高い |
| M6 | ReplayHomeTimelineのキャッシュ活用 | 🟢 高い |
| M7 | PWAオフラインタイムライン表示 | 🟢 高い |
| M8 | NIP-40有効期限チェックの自動化 | 🟢 中 |
| M9 | ネガティブキャッシュで不存在イベント再フェッチ防止 | 🟢 中 |
| M10 | seenOn自動管理でtie operator撤去 | 🟢 中 |

### 推奨アクション（更新版反映後）

**ブロッカー（実装前に必須）:**

1. `createAllEventObservable()` のAPI存在確認 — スペックに依然記載あり。rx-nostrに新規実装予定なのか確認
2. `store.query()` の `since`/`until`/`ids` サポート明記 — nostterのページネーションとスレッド表示に必須
3. `staleTime` の判定基準明確化 — 最後のREQ完了時刻ベースか、CachedEvent.firstSeenベースか
4. Svelteアダプターの $state / writable() 方針決定

**Phase 1（低リスク・高効果）— 更新版で実現可能に:** 5. `connectStore()` 導入（SSR自動フォールバック対応済み）6. connectStore()のフィルタで `event.kind !== 4` DM除外7. pendingDeletionsにTTLクリーンアップ追加を要望

**Phase 1と並行（スペック改善要望）:** 8. pendingDeletionsのTTL設計9. IDBエラーポリシー（QuotaExceeded等）設計10. Replaceable置換時の通知方式明記

**Phase 2以降:** 11. メタデータ → タイムライン → Action の段階的SyncedQuery移行 12. eventsStore → `store.query({ until, limit })` ページング移行 13. 旧キャッシュ層撤去（WebStorage, EventCache, tie operator, async-lock）

**v2要望（優先度高めで）:** 14. Multi-tab BroadcastChannel sync 15. REQ重複排除

---

## Appendix: コード対応表

| auftakt概念             | nostter現在の実装                                                | ファイル                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| connectStore()          | 各所のsubscribe内store保存                                       | 30+箇所                                     |
| store.add()             | eventCache.addIfNotExists() + storeMetadata() + WebStorage.set() | cache/db.ts, cache/Events.ts, WebStorage.ts |
| store.query()           | $metadataStore, $eventItemStore, $replaceableEventsStore         | cache/Events.ts                             |
| SyncedQuery (dual)      | HomeTimeline.subscribe() + older()                               | timelines/HomeTimeline.ts                   |
| SyncedQuery (backward)  | RxNostrHelper.fetchEvents()                                      | RxNostrHelper.ts                            |
| SyncedQuery (forward)   | createRxForwardReq + subscribe                                   | HomeTimeline.ts, PublicTimeline.ts          |
| CachedEvent.seenOn      | tie operator + seenOn Map                                        | RxNostrTie.ts, MainTimeline.ts              |
| NIP rules (kind:5)      | deletedEventIds + deletedEventIdsByPubkey                        | author/Delete.ts                            |
| NIP rules (replaceable) | latestEach() + created_at比較                                    | HomeTimeline.ts, Author.ts                  |
| publishEvent()          | rxNostr.send() 直接呼び出し                                      | 各所                                        |
| fetchById()             | RxNostrHelper.fetchEvent()                                       | RxNostrHelper.ts                            |
| negativeCache           | なし                                                             | —                                           |
| staleTime               | なし                                                             | —                                           |
| reconcileDeletions      | なし                                                             | —                                           |
