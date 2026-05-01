# Auftakt NIP Inventory Refresh Automation Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Summary

この設計は、Auftakt の NIP inventory / matrix / status documentation を
deterministic に検証する automation を強化する。

初期方針は check-first とする。既存の
`docs/auftakt/nips-inventory.json` を vendored official inventory snapshot とし、
通常 CI では network fetch を行わない。公式 inventory refresh command は後続で追加
できるが、この wave の実装対象は drift 検出、matrix contract 強化、docs sync check、
fixture-based tests である。

Support status の自動昇格は禁止する。新しい NIP や official status 変更が見つかっ
た場合、automation は check failure を出し、人間 review を要求する。
Unknown or unclassified NIPs fail deterministic checks.

## Current Context

既存の土台は次の通りである。

- `docs/auftakt/nips-inventory.json`
- `docs/auftakt/nip-matrix.json`
- `scripts/check-auftakt-nips.ts`
- `scripts/check-auftakt-nips.test.ts`
- `docs/auftakt/status-verification.md`
- `pnpm run check:auftakt:nips`

現在の checker は inventory に載っている NIP が matrix に存在することと、基本字段
`level`, `status`, `owner`, `proof`, `priority`, `scopeNotes` が空でないことを確認す
る。これは最小限の matrix completeness には有効だが、matrix 側の余剰 entry、source
metadata drift、docs sync drift、support status の安全な変更管理までは扱わない。

## Goals

- CI-friendly かつ network-free な NIP matrix check を強化する。
- Official inventory snapshot と local matrix の source metadata drift を検出する。
- Unknown / unclassified NIP を deterministic に失敗させる。
- Matrix entry の owner、support boundary、proof command / proof anchor の不足を
  失敗させる。
- `docs/auftakt/status-verification.md` が canonical JSON matrix と矛盾したときに
  失敗させる。
- Fixture tests で official inventory drift を network なしに再現する。
- Support status change は自動昇格せず、人間 review 前提の failure として扱う。

## Non-Goals

- 初期実装で公式 README を network fetch して local docs を書き換える refresh command
  を追加しない。
- Support status を自動で `partial` や `implemented` に昇格しない。
- NIP 本体の実装計画をこの wave に含めない。
- `status-verification.md` を canonical source に戻さない。Canonical source は JSON
  inventory / matrix である。
- README や spec 全体の大規模再生成をしない。

## Official Inventory Source

Canonical official inventory snapshot は
`docs/auftakt/nips-inventory.json` である。

```json
{
  "sourceUrl": "https://github.com/nostr-protocol/nips",
  "sourceDate": "2026-04-24",
  "nips": ["01", "02"]
}
```

`sourceUrl` と `sourceDate` は必須である。`nips` は重複なし、uppercase normalized、
lexicographically sorted の配列として扱う。Inventory snapshot が壊れている場合、
checker は matrix check の前に failure を返す。

Official fetch failure は local docs rewrite の理由にならない。この wave では fetch
command を実装しないが、後続 refresh command は fetch failure 時に exit non-zero し、
fixture mode 以外で local files を変更してはならない。
Official fetch failure never rewrites local docs.

## Local Matrix Contract

Canonical local matrix は `docs/auftakt/nip-matrix.json` である。

Matrix top-level `sourceUrl` と `sourceDate` は inventory と一致しなければならない。
Matrix entries は inventory の NIP set と完全一致する。Missing entry と stale extra
entry はどちらも failure である。

各 entry の必須 fields は次の通りである。

- `nip`
- `level`
- `status`
- `owner`
- `proof`
- `priority`
- `scopeNotes`

Support boundary は `level`, `status`, `scopeNotes` の組で表現する。`scopeNotes` が
空、または docs-only placeholder だけの場合は failure とする。

`owner` は `docs/auftakt/nip-matrix.json` だけに逃がしてよいのは scoped-out /
not-started / deprecated / unrecommended のような非実装 claim に限る。`implemented`
または `partial` claim で docs-only owner の場合は failure とする。

`proof` は file path または command anchor を含む必要がある。`implemented` と
`partial` claim では docs-only proof だけを認めない。Scoped-out claim では matrix 自
身を proof としてよいが、scope reason が必要である。

## Refresh Command

この wave では network refresh command を実装しない。Design 上の将来 command は次の
形にする。

```bash
pnpm run refresh:auftakt:nips
```

将来 command の rules:

- Official README fetch に失敗したら local files を書き換えない。
- New / removed / renamed / unrecommended NIPs は JSON diff を生成するだけで、
  support status を自動昇格しない。
- `--fixture <path>` mode で deterministic tests を書けるようにする。
- Default mode は human review 前提の update proposal を出す。

この wave の implementation plan では refresh command 自体を作らない。代わりに
checker の fixture tests で将来 refresh behavior の安全条件を固定する。

## Check Command

既存 command を強化する。

```bash
pnpm run check:auftakt:nips
```

Expected behavior:

- Inventory schema が壊れていたら failure。
- Matrix schema が壊れていたら failure。
- Inventory と matrix の source metadata が違えば failure。
- Inventory にある NIP が matrix にない場合は failure。
- Matrix に inventory 外の NIP がある場合は failure。
- Required fields が空なら failure。
- Implemented / partial claim の owner が docs-only なら failure。
- Implemented / partial claim の proof が docs-only なら failure。
- Unknown status / level / priority は failure。
- Support status promotion は checker 内で自動修正しない。

Checker は JSON を rewrite しない。検出だけを行う。
Support status changes are never auto-promoted.

## Docs Sync

`docs/auftakt/status-verification.md` は canonical JSON matrix の companion document と
して扱う。

初期 docs sync check は、全 matrix entry の NIP 番号が
`status-verification.md` に `NIP-XX` として現れることを確認する。これにより、JSON
matrix だけ更新して status documentation が古くなる drift を検出する。

完全な markdown table regeneration はこの wave の non-goal とする。必要なら後続で
docs generator を設計する。

## Error Handling

Checker はすべての validation error を集約して返す。一つ目の error で止めない。

Malformed JSON は CLI では file path と parse failure を含む high-level error にする。
Library function tests では malformed object を直接渡して deterministic に検証する。

Network fetch はこの wave の check path に存在しない。後続 refresh command の fetch
failure は local rewrite なしの non-zero exit とする。

Support status change は automatic fix ではなく review-required error として扱う。
この wave では「support status を自動昇格する code path が存在しない」ことを test で
固定する。

## Testing

Implementation should add focused tests for:

- official inventory fixture drift
- unknown official NIP classification failure
- stale matrix entry failure
- source metadata mismatch
- missing owner failure
- implemented / partial docs-only owner failure
- missing support boundary failure
- implemented / partial docs-only proof failure
- missing proof command / proof anchor failure
- status-verification docs drift
- network failure does not rewrite docs in fixture-level refresh safety helper
- support status auto-promotion is rejected or absent

Fixture tests cover inventory drift without network access.

Verification gate:

```bash
pnpm exec vitest run scripts/check-auftakt-nips.test.ts
pnpm run check:auftakt:nips
pnpm run check:auftakt-migration -- --proof
```

## Acceptance Criteria

- `pnpm run check:auftakt:nips` remains deterministic and network-free.
- Inventory and matrix source metadata drift is detected.
- Missing official NIPs and stale matrix entries fail.
- Required owner, support boundary, proof, priority, and scope notes gaps fail.
- Implemented / partial claims cannot use docs-only owner or proof.
- `docs/auftakt/status-verification.md` drift is detected at least by NIP number coverage.
- Fixture tests cover official inventory changes without network access.
- Official fetch failure never rewrites local docs.
- Support status is never auto-promoted by automation.
