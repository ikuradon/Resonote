# feat/auftakt-foundation Audit

## Reliability Note

このブランチは正常挙動を満たせず破棄されているため、以下は品質保証ではなく回収可能性の監査結果である。`採用` に分類した項目でも、現行 [specs.md](/root/src/github.com/ikuradon/Resonote/docs/auftakt/specs.md) に沿った再検証を必須とする。

## Branch Snapshot

- branch: `feat/auftakt-foundation`
- diff vs `main`: 119 files, `+17852 / -223`
- 性質: 内製 `auftakt` を `src/shared/nostr/auftakt/` 以下で一気に実装した大型試作

## 採用

小さく独立しており、現行 package 構成にも移しやすい候補。

- `src/shared/nostr/auftakt/core/relay/closed-reason.ts`
- `src/shared/nostr/auftakt/core/relay/connection-state.ts`
- `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- `src/shared/nostr/auftakt/backends/dexie/schema.ts`
- `src/shared/nostr/auftakt/core/relay/filter-shard.ts`
- `src/shared/nostr/auftakt/core/relay/filter-match.ts`
- `src/shared/nostr/auftakt/core/relay/fetch-scheduler.ts`
- `src/shared/nostr/auftakt/core/relay/forward-assembler.ts`
- `src/shared/nostr/auftakt/core/relay/lru-dedup.ts`
- `src/shared/nostr/auftakt/core/relay/nip11-registry.ts`
- `src/shared/nostr/auftakt/core/relay/publish-manager.ts`
- `src/shared/nostr/auftakt/core/relay/slot-counter.ts`
- `src/shared/nostr/auftakt/core/relay/temporary-relay-tracker.ts`
- `src/shared/nostr/auftakt/core/relay/event-validator.ts`
- `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`
- `src/shared/nostr/auftakt/core/signers/noop-signer.ts`
- `src/shared/nostr/auftakt/core/signers/seckey-signer.ts`
- `src/shared/nostr/auftakt/testing/fakes.ts`

## 参考再実装

設計や分割は有用だが、そのまま持ち込むと現行仕様と責務がずれる候補。

- `src/shared/nostr/auftakt/core/runtime.ts`
- `src/shared/nostr/auftakt/core/sync-engine.ts`
- `src/shared/nostr/auftakt/core/sync/recovery-strategy.ts`
- `src/shared/nostr/auftakt/core/sync/subscription-manager.ts`
- `src/shared/nostr/auftakt/core/sync/tombstone-processor.ts`
- `src/shared/nostr/auftakt/core/relay/relay-connection.ts`
- `src/shared/nostr/auftakt/core/relay/relay-manager.ts`
- `src/shared/nostr/auftakt/core/relay/heartbeat.ts`
- `src/shared/nostr/auftakt/core/relay/circuit-breaker.ts`
- `src/shared/nostr/auftakt/core/relay/negentropy-session.ts`
- `src/shared/nostr/auftakt/core/handles/base-handle.ts`
- `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- `src/shared/nostr/auftakt/core/models/event.ts`
- `src/shared/nostr/auftakt/core/models/user.ts`
- `src/shared/nostr/auftakt/core/models/nostr-link.ts`
- `src/shared/nostr/auftakt/core/models/session.ts`
- `src/shared/nostr/auftakt/core/memory-store.ts`
- `src/shared/nostr/auftakt/core/registry.ts`
- `src/shared/nostr/auftakt/core/gc.ts`
- `src/shared/nostr/auftakt/builtin/links.ts`
- `src/shared/nostr/auftakt/builtin/relays.ts`
- `src/shared/nostr/auftakt/builtin/users.ts`
- `src/shared/nostr/auftakt/builtin/emojis.ts`

## 破棄

現行仕様と境界が明確に衝突するか、異常挙動の温床になりやすい候補。

- `docs/auftakt/spec.md`
- `src/shared/nostr/auftakt/builtin/comments.ts`
- `src/shared/nostr/auftakt/builtin/index.ts`
- `src/shared/nostr/auftakt/index.ts`
- `src/shared/nostr/auftakt-runtime.svelte.ts`
- app bootstrap へ直接差し込む配線全般
- `core/models` を中心に facade と実行責務を同居させる構成

## テストとして回収価値が高いもの

- `src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`
- `src/shared/nostr/auftakt/core/relay/fetch-scheduler.test.ts`
- `src/shared/nostr/auftakt/core/relay/forward-assembler.test.ts`
- `src/shared/nostr/auftakt/core/relay/relay-manager.test.ts`
- `src/shared/nostr/auftakt/core/relay/negentropy-session.test.ts`
- `src/shared/nostr/auftakt/core/runtime.test.ts`
- `src/shared/nostr/auftakt/core/models/session.test.ts`
- `src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`
- `src/shared/nostr/auftakt/core/sync-engine.test.ts`
- `src/shared/nostr/auftakt/core/sync/recovery-strategy.test.ts`
- `src/shared/nostr/auftakt/core/models/nostr-link.test.ts`
- `src/shared/nostr/auftakt/integration/home-timeline.test.ts`
- `src/shared/nostr/auftakt/integration/profile-view.test.ts`
- `src/shared/nostr/auftakt/integration/publish-flow.test.ts`

## 現行仕様との主な矛盾

### Layer conflicts

- `src/shared/nostr/auftakt/core/models/session.ts` が write path, retry, optimistic, publish completion, pending publish replay を一箇所で抱えすぎている
- `src/shared/nostr/auftakt/core/models/*.ts` と `src/shared/nostr/auftakt/core/handles/*.ts` の責務境界が、現行の `handles` 主体構造と一致しない
- `src/shared/nostr/auftakt/core/runtime.ts` の組み立て責務が厚く、現行の package 分離よりも一体化が強い

### Package-boundary conflicts

- `src/shared/nostr/auftakt/builtin/comments.ts` は、現行では `packages/auftakt-resonote` に出すべき内容
- `src/shared/nostr/auftakt/index.ts` が built-in と facade と runtime wiring を同時に露出している
- `docs/auftakt/spec.md` は現行の統合仕様ではなく旧仕様

### API-surface conflicts

- facade を残しつつ実装を `handles` に寄せる現行方針に対し、foundation は `models` 中心
- `createRuntime` に gc, registry, store, sync, relay wiring が集中している

### Performance conflicts

- `src/shared/nostr/auftakt/core/models/session.ts`
- `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- `src/shared/nostr/auftakt/core/relay/relay-manager.ts`

上記 3 ファイルが大きく、hot path と整合性処理が分離しきれていない。

### Security conflicts

- optimistic event, pending publish, tombstone まわりの信頼境界が `Session` へ寄りすぎている
- built-in と root logic の境界が甘く、標準機能の責務が core へ侵食している

## なぜ wholesale revive が危険か

- 正常挙動に至っていないコードなので、テスト量の多さが正しさを保証しない
- 現行の monorepo package 境界と一致せず、復活すると再度責務の混線が起きる
- `comments` など、今は `auftakt-resonote` に隔離したいものが core 側に混入している
- 大型ファイルのまま戻すと、当時と同じく transport / sync / store / write path の切り分けが崩れる
- 旧 API 形状前提のテストまで一緒に戻るため、「通るが方針違反」の状態を固定化しやすい
