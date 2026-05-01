# Auftakt Spec Conflicts

## Layer conflicts

- foundation: `src/shared/nostr/auftakt/core/models/session.ts` が write path, retry, optimistic, publish completion を抱えすぎている
- foundation: `src/shared/nostr/auftakt/core/models/*.ts` と `src/shared/nostr/auftakt/core/handles/*.ts` の責務境界が、現行 `handles` 主体構造と一致しない
- migration: `src/shared/nostr/store.ts` が store と feature wiring を兼ねている
- migration: `src/shared/nostr/client.ts` が `transport` ではなく app 直下の relay client として振る舞っている

## Package-boundary conflicts

- foundation: `src/shared/nostr/auftakt/builtin/comments.ts` は現行では `packages/auftakt-resonote` 側に出すべき
- foundation: `src/shared/nostr/auftakt/index.ts` が facade, runtime, built-in を同時に露出している
- migration: app 内 private store/client を中心にしており package 境界の考え方がない

## Built-in adoption conflicts

- foundation: `src/shared/nostr/auftakt/builtin/comments.ts` は built-in 採用基準を満たさない
- foundation: `src/shared/nostr/auftakt/builtin/backfill.ts` は root logic と built-in の境界を曖昧にする

## API-surface conflicts

- foundation: `core/models` を facade として残しつつ、実行責務まで同居させている
- foundation: `createRuntime` に gc, store, sync, relay wiring が集中している
- migration: 外部 `@ikuradon/auftakt` の API に寄りすぎていて、内製 `auftakt` の facade 設計に繋がらない

## Performance conflicts

- foundation: `src/shared/nostr/auftakt/core/models/session.ts` が肥大化しすぎて write hot path を追いにくい
- foundation: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts` が大きく、timeline 戦略の切り出しが弱い
- foundation: `src/shared/nostr/auftakt/core/relay/relay-manager.ts` が広範な責務を持つ
- migration: batch/shard 風制御の責務が app 側へ漏れている

## Security conflicts

- foundation: optimistic, pending publish, tombstone の信頼境界が `Session` へ寄りすぎている
- foundation: built-in と root logic の境界が甘く、責務の越境が起きている
- migration: relay 由来イベントの検証責務が library 本体へ集約されていない
