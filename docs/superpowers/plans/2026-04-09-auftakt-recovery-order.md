# Auftakt Recovery Order

## Order

1. tests and fakes
2. pure transport helpers
3. persistent store pieces
4. sync orchestration pieces
5. handle facade rewrite
6. write/session path rewrite
7. app migration hints only

## Guardrails

- branch 単位の revive は行わない
- `採用` でも現行 package 構成へ移植してから使う
- `参考再実装` はコード持ち込みではなく設計再実装とする
- `破棄` は次の実装判断の正当化材料に使わない
- `feat/auftakt-foundation` は部品とテストを優先して回収する
- `feat/auftakt-migration` は app migration の観察パターンだけ回収する

## Next Plans

- `packages/auftakt`: transport/store/sync foundation
- `packages/auftakt`: handles facade and signer/write path
- `packages/auftakt-resonote`: comments/content preset
- app migration from `rx-nostr` and custom cache
