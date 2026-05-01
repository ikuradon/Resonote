# Auftakt Rx-Nostr Removal

## Goal

`rx-nostr` と `@rx-nostr/crypto` をアプリコードと依存関係から完全撤去する。

## Scope

1. `src/shared/content/podcast-resolver.ts`
   - `@rx-nostr/crypto` を `nostr-tools` に置換
2. `src/shared/nostr/client.ts`
   - `rx-nostr` lifecycle 実装を撤去
3. `src/shared/nostr/auftakt-runtime.ts`
   - `rx-nostr` request / subscription / publish / relay status 依存を撤去
4. 旧 bridge / test の更新
5. `package.json` / `pnpm-lock.yaml` から `rx-nostr` と `@rx-nostr/crypto` を削除

## Execution Order

1. `podcast-resolver` の署名検証を置換
2. read path の `rx-nostr` 依存を package helper へ移送
3. subscription / publish path の `rx-nostr` 依存を package helper へ移送
4. `client.ts` の singleton lifecycle を削除
5. 依存削除と全体回帰

## Guardrails

- app 側の公開 API は極力維持する
- `gateway.ts` は新規責務を増やさない
- `auftakt-runtime.ts` は thin wrapper 化のみ許容し、新しい本体ロジックは package 側へ寄せる
- 各段でテストを先に更新し、失敗を確認してから実装する
