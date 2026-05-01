# feat/auftakt-migration Audit

## Reliability Note

このブランチは app 置換の途中案であり、正常挙動を満たせず破棄されている。ここで回収するのは挙動保証済みコードではなく、cache-first や batch などの観察済みパターンのみとする。

## Branch Snapshot

- branch: `feat/auftakt-migration`
- diff vs `main`: 84 files, `+4340 / -4952`
- 性質: 外部 `@ikuradon/auftakt` を使って app 内の `rx-nostr + custom cache` を置換しようとした途中案

## 採用

コード本体よりもテスト観点の回収が中心。

- `src/shared/nostr/store.test.ts`
- `src/features/comments/application/comment-subscription.test.ts`
- `src/features/notifications/ui/notifications-view-model.test.ts`
- `src/shared/browser/emoji-sets.test.ts`
- `src/shared/browser/profile.svelte.test.ts`
- `src/features/follows/infra/wot-fetcher.test.ts`
- `src/features/nip19-resolver/application/fetch-event.test.ts`
- `src/features/profiles/application/profile-queries.test.ts`

## 参考再実装

app migration や cache-first のパターンだけ参考になる候補。

- `src/shared/nostr/store.ts`
- `src/shared/browser/profile.svelte.ts`
- `src/shared/browser/emoji-sets.svelte.ts`
- `src/features/comments/application/comment-subscription.ts`
- `src/features/notifications/ui/notifications-view-model.svelte.ts`
- `src/features/follows/infra/wot-fetcher.ts`
- `src/features/nip19-resolver/application/fetch-event.ts`
- `src/features/profiles/application/profile-queries.ts`
- `src/features/comments/ui/comment-view-model.svelte.ts`
- `src/shared/content/podcast-resolver.ts`
- `src/shared/content/episode-resolver.ts`

## 破棄

- `package.json`
- `src/shared/nostr/client.ts`
- `src/shared/nostr/relays-config.ts`
- `src/shared/nostr/cached-query.svelte.ts`
- `src/shared/nostr/cached-query.ts`
- `src/shared/nostr/event-db.ts`
- `src/shared/nostr/gateway.ts`
- `src/app/bootstrap/init-session.ts`
- `src/shared/browser/dev-tools.svelte.ts`
- 外部 `@ikuradon/auftakt` の API 形に強く依存する app 側ラッパー全般

## app migration で参考になるパターン

- `src/shared/nostr/store.ts`
  - `getStoreAsync()` / `getStore()` / `initStore()` の lazy 初期化
  - cache first -> synced query -> direct fallback の順序
- `src/shared/browser/profile.svelte.ts`
  - profile 読み込みの cache restore 後 batch fetch
- `src/shared/browser/emoji-sets.svelte.ts`
  - emoji set refs の restore 後 batch 取得
- `src/features/comments/application/comment-subscription.ts`
  - feature 層を薄くして query 中心へ寄せる方針
- `src/features/notifications/ui/notifications-view-model.svelte.ts`
  - 複数 query と follow-up batch を組み合わせる view model パターン
- `src/features/profiles/application/profile-queries.ts`
  - backward 完了時点の snapshot を採用する pagination
- `src/features/comments/ui/comment-view-model.svelte.ts`
  - 複数 filter をまとめて REQ 数を減らす live subscription
- `src/features/nip19-resolver/application/fetch-event.ts`
  - relay hint を並列に投げて first success で残り abort
- `src/shared/browser/profile.svelte.ts`, `src/shared/browser/emoji-sets.svelte.ts`
  - generation/cancellation で古い非同期結果を捨てる

## 現行仕様との主な矛盾

### Layer conflicts

- `src/shared/nostr/store.ts` が store 初期化と app wiring を兼ねている
- `src/shared/nostr/client.ts` が `rx-nostr` を中核に据えたままで、現行 `transport` 層の自動 batch/shard 方針とずれる
- `src/app/bootstrap/init-session.ts` が relay selection と session lifecycle を app utility に抱えている

### Package-boundary conflicts

- package 境界がなく、app 内 private store/client を中心にしている
- `auftakt` 本体と `auftakt-resonote` を分ける前提がない

### API-surface conflicts

- 外部 `@ikuradon/auftakt` の API を app 側が直接なぞっており、内製ライブラリの facade 設計へつながらない
- `src/features/comments/ui/comment-view-model.svelte.ts` などが `@ikuradon/auftakt/sync` を直接触る設計になっている

### Performance conflicts

- batch や synced query の責務が app 側に漏れていて、library 内へ閉じていない
- `rx-nostr` ベースの fetch/live が残るため、slot/shard 管理を `auftakt` 内で一元化できない

### Security conflicts

- relay 由来イベントの検証責務が app 側ラッパー経由で分散しやすい
- 外部 package 依存のため、trust boundary を内製 `auftakt` の仕様に合わせて固定できない

## なぜ wholesale revive が危険か

- そもそも内製 `auftakt` ではなく、外部 package を app に差し込む途中案である
- `rx-nostr` が中核に残っており、今回の「完全置換」と矛盾する
- app 内ストア中心の構成を戻すと、せっかく定義した monorepo package 境界が崩れる
- 価値があるのは cache-first や batch 利用の観察パターンであって、アーキテクチャ全体ではない
- `gateway / event-db / cached-query` の削除が早く、移行順序そのものも現行方針とずれている
