# Auftakt Status Verification Artifact

このドキュメントは、Auftakt 仕様書 §14 に記載された実装状況の検証結果を記録したものである。

## 検証対象: 仕様書 §14 主要 6 項目

| 項目                           | 判定 (Verdict)                | 根拠概要                                                                                                                                            |
| :----------------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App-facing façade**          | `implemented`                 | `src/shared/auftakt/resonote.ts` は唯一の app-facing import point として維持され、`--report consumers` でも targeted consumer leak 0 が確認できる。 |
| **ReadSettlement**             | `implemented`                 | canonical `ReadSettlement` contract への consumer cutover と targeted regression が完了している。                                                   |
| **Relay lifecycle / recovery** | `implemented`                 | `observeRelayStatuses` 等の API と、`relays.test.ts` による回復シーケンスの検証が確認された。                                                       |
| **tombstone / deletion**       | `implemented`                 | `ReconcileReasonCode` への統合と、`comment-view-model.svelte.ts` での実装・検証が完了している。                                                     |
| **negentropy**                 | `implemented (internal-only)` | raw `NEG-*` を adapter/runtime 層に閉じ込めた internal sync/repair path と fallback repair が実装済み。                                             |
| **publish / session**          | `implemented`                 | `publishSignedEvent` および `retryQueuedPublishes` が実装され、正常に動作している。                                                                 |

## 詳細検証結果

### 1. App-facing façade

- **判定**: `implemented`
- **コードアンカー**: `src/shared/auftakt/resonote.ts`
- **検証アンカー**: `scripts/check-auftakt-migration.mjs` (`--proof`, `--report consumers`)
- **状況**: façade は正典の import point のまま維持され、Task 8 で remaining targeted consumer cutover も完了した。`pnpm run check:auftakt-migration -- --report consumers` は `PASS` を返し、残存 targeted leak は 0 である。

### 2. ReadSettlement

- **判定**: `implemented`
- **コードアンカー**: `packages/core/src/index.ts` (型), `src/shared/auftakt/resonote.ts` (露出)
- **検証アンカー**: `packages/core/src/read-settlement.contract.test.ts`, `src/shared/nostr/cached-query.test.ts`
- **状況**:
  - **型/語彙**: `ReadSettlement` と related provenance/reason 語彙は `@auftakt/core` に固定済み。
  - **ランタイム**: `cached-query.svelte.ts` は canonical `ReadSettlement` を返し、consumer は `settlement.phase` / `settlement.reason` を source-of-truth として扱う。
  - **Consumer**: comments / notifications / relays の targeted regression が green で、旧 public contract (`source`, `settled`, `networkSettled`) への依存は semantic guard で監視される。

### 3. Relay lifecycle / recovery

- **判定**: `implemented`
- **コードアンカー**: `src/shared/auftakt/resonote.ts` (`observeRelayStatuses`)
- **検証アンカー**: `src/shared/browser/relays.test.ts`
- **状況**: リレーの接続状態、再送（replay）状態、デグレード状態の監視と正規化が実装されており、テストによってその振る舞いが保証されている。

### 4. tombstone / deletion

- **判定**: `implemented`
- **コードアンカー**: `packages/core/src/index.ts` (`ReconcileReasonCode.tombstoned`)
- **検証アンカー**: `src/features/comments/ui/comment-view-model.svelte.ts`
- **状況**: 削除イベント受信時の tombstone 処理、およびキャッシュからのパージロジックが実装済み。`reply-thread.test.ts` 等で整合性が検証されている。

### 5. negentropy

- **判定**: `implemented (internal-only)`
- **コードアンカー**: `packages/adapter-relay/src/index.ts`, `packages/resonote/src/runtime.ts`
- **検証アンカー**: `packages/adapter-relay/src/request-replay.contract.test.ts`, `packages/resonote/src/relay-repair.contract.test.ts`, `scripts/check-auftakt-migration.mjs --semantic-guard`
- **状況**: negentropy は internal repair coordinator の strategy として実装され、relay 未対応・decode failure・transport failure 時は standard backward repair へ即 fallback する。raw `NEG-*` の production hit は adapter layer に限定され、façade / feature code には露出しない。

## 完了コマンド列

- **Surface proof**: `pnpm run check:auftakt-migration -- --proof`
- **Semantic gate**: `pnpm run check:auftakt-semantic`
- **Canonical completion**: `pnpm run check:auftakt-complete`

### 6. publish / session

- **判定**: `implemented`
- **コードアンカー**: `src/shared/auftakt/resonote.ts` (`publishSignedEvent`, `retryQueuedPublishes`)
- **検証アンカー**: `src/features/content-resolution/application/resolve-content.test.ts`
- **状況**: 単発および複数イベントの publish、オフライン時の再試行キュー管理が実装済み。
