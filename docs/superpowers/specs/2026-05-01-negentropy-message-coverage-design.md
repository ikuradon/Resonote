# Negentropy Message Coverage Design

## Context

PR #235 は、ordinary read の Negentropy startup で JSON 風の `initialMessageHex`
payload を送っていた問題を、NIP-77 の hex-encoded message に置き換えて修正した。
その実装で `packages/runtime/src/negentropy-message.ts` を切り出し、ordinary read
verification と relay repair の両方が使う内部 ID-list message encode/decode helper を
このファイルが所有するようになった。

ローカルの `pnpm run test:coverage` では project coverage は設定された project target
を超えている。一方で `packages/runtime/src/negentropy-message.ts` は部分的にしか
cover されていない。`codecov.yml` は patch coverage 80% を要求しているため、この新規
helper が coverage 低下の主因と考えられる。

## Goal

新しい Negentropy message codec に絞った test を追加し、PR #235 の patch coverage を上げる。
test は bug fix の再発防止を証明し、runtime safety に関係する codec branch を cover する。

## Non-Goals

- public package exports は変更しない。
- PR #235 で導入した Negentropy message wire format は変更しない。
- Codecov threshold の緩和や helper の coverage exclude はしない。
- unrelated な relay gateway、relay repair、session behavior は refactor しない。

## Approach

`packages/runtime/src/negentropy-message.contract.test.ts` を runtime source の隣に追加する。
これは public API expansion ではなく package-internal contract coverage なので、test file
は内部 helper を直接 import する。

contract tests は次を cover する。

- empty local set を `6100000200` に encode すること
- encode 前に event refs を `created_at` と `id` で sort すること
- ID-list message を event IDs に decode できること
- odd-length hex payload を reject すること
- JSON 風の `[]` のような non-hex payload を reject すること
- unsupported protocol version を reject すること
- encode 時に invalid event ID を reject すること
- decode 時に unsupported mode と truncated ID list を reject すること
- skip range は ID を生成せずに扱うこと

## Error Handling

helper は malformed local input と malformed relay message に対して具体的な `Error` message
を投げる。test では代表的な message を assert し、将来の変更で JSON payload の再導入や
invalid wire data の受け入れが静かに起きないようにする。

## Testing

まず focused package tests を実行する。

```bash
pnpm exec vitest run packages/runtime/src/negentropy-message.contract.test.ts packages/runtime/src/relay-gateway.contract.test.ts packages/runtime/src/relay-repair.contract.test.ts
```

次に PR #235 と同じ validation を実行する。

```bash
pnpm run test:packages
pnpm run check:auftakt-migration -- --proof
pnpm run test:coverage
```

`pnpm run test:coverage` は、既存の package boundary tests が `git ls-files` を spawn するため、
ローカルでは sandbox escalation が必要になる場合がある。
