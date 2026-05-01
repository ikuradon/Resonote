# Negentropy Message Coverage Design

## Context

PR #235 は、ordinary read の Negentropy startup で JSON 風の `initialMessageHex`
payload を送っていた問題を、NIP-77 の hex-encoded message に置き換えて修正した。
その実装で `packages/runtime/src/negentropy-message.ts` を切り出し、ordinary read
verification と relay repair の両方が使う内部 ID-list message encode/decode helper を
このファイルが所有するようになった。

ローカルの `pnpm run test:coverage` では project coverage は設定された project target
を超えている。一方で coverage report では `packages/runtime/src/negentropy-message.ts`
が statements 77.27%、branches 50%、lines 77.04% に留まっており、uncovered lines /
branches が目立つ。`codecov.yml` は patch coverage 80% を要求しているため、この新規
helper が PR #235 の patch coverage を押し下げている主要因と見る。

## Goal

新しい Negentropy message codec に絞った test を追加し、PR #235 の patch coverage を上げる。
test は bug fix の再発防止を証明し、runtime safety に関係する codec branch を cover する。

## Non-Goals

- public package exports は変更しない。
- PR #235 で導入した Negentropy message wire format は変更しない。
- Codecov threshold の緩和や helper の coverage exclude はしない。
- unrelated な relay gateway、relay repair、session behavior は refactor しない。
- 新しい `.contract.test.ts` file は test-only に留め、package build output や public exports
  に影響させない。

## Approach

`packages/runtime/src/negentropy-message.contract.test.ts` を runtime source の隣に追加する。
これは public API expansion ではなく package-internal contract coverage なので、test file
は内部 helper を直接 import する。

contract tests は次を cover する。

- empty local set を `6100000200` に encode すること
- `6100000200` の byte-level 意味を、helper 実装上の frame / field boundary に合わせて
  test fixture 近くの comment に残すこと
- encode 前に event refs を `created_at` と `id` で sort すること。test は同じ
  `created_at` の複数 event を逆順で渡し、`id` tie-breaker まで固定する
- ID-list message を event IDs に decode できること
- odd-length hex payload を reject すること
- JSON 風の `[]` のような non-hex payload を reject すること
- unsupported protocol version を reject すること
- encode 時に invalid event ID を reject すること。invalid length と 64 chars だが
  non-hex を含む case を分ける
- helper が uppercase hex input を許容する場合、その decode 結果は lowercase hex IDs に
  normalize されることを固定する
- duplicate IDs は codec layer では preserve すること。dedupe は上位 layer の責務とし、
  codec は valid wire data に対して lossless decoder として振る舞う。これにより relay
  response の重複や異常を parsing layer で隠さない
- decode 側でも empty ID-list message は空配列として扱うこと
- decode 時に unsupported mode と truncated ID list を reject すること
- skip range fixture は byte-level 意味を comment で明示すること
- skip range frame だけの message を decode しても synthetic event ID は生成しないこと
- skip range の後ろに ID-list frame がある message では、skip range を無視し、
  ID-list frame の IDs だけを返すこと
- 後続 frame として完全に parse できない余剰 bytes は reject すること

## Error Handling

helper は malformed local input と malformed relay message に対して具体的な `Error` message
を投げる。test では全文一致ではなく意味のある token を regex で assert し、wording 改善の
余地を残しながら、JSON payload の再導入や invalid wire data の受け入れが静かに起きない
ようにする。

## Testing

まず focused package tests を実行する。codec contract test に加えて、既存の ordinary read /
relay repair の contract tests も同時に実行し、internal helper の直接 import や追加 test file
による regression がないことを確認する。

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

package boundary checks と public API contract tests により、新しい `.contract.test.ts` が
public source entry や package export として扱われないことも確認する。
