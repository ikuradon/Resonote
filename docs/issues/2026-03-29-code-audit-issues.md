# 2026-03-29 Code Audit Issue Drafts

2026-03-29 時点のコード監査結果を、GitHub issue に転記しやすい形で整理したドラフト。

監査で確認したもの:

- 最新 NIP の一次ソース確認: NIP-09, 19, 22, 44, 51, 65, 73
- 三層構造の静的走査
- セキュリティ観点のコード精読
- パフォーマンス観点の bundle 確認
- 実行確認: `pnpm run check:structure`, `pnpm run check`, `pnpm run lint`, `pnpm test`, `pnpm run perf:bundle:summary`

---

## Issue 1: NIP-09 削除検証が未観測イベントを誤って受理する

- 優先度: Must
- 分類: bug, security, nostr-spec
- 関連ファイル:
  - `src/features/comments/domain/deletion-rules.ts`
  - `src/features/comments/ui/comment-view-model.svelte.ts`
  - `src/features/comments/domain/deletion-rules.test.ts`

### 概要

削除イベントの対象元イベントが未観測の場合でも、削除を受理して `deletedIds` に入れている。NIP-09 の author check を満たしていない。

### 背景・動機

現在の実装は `originalPubkey` が不明な場合に deletion を通しているため、未取得イベントを将来的に表示する前に隠せてしまう。仕様違反であり、表示抑止の整合性も崩す。

### 想定配置 / ownership

- `domain/`: deletion 判定ルールの修正
- `ui/`: 受理条件変更後の表示整合性確認
- `domain test`: 既存テスト期待値の修正

### 完了条件

- 元イベントの `pubkey` が未観測な deletion は受理しない
- `pubkey` 一致時のみ deletion を反映する
- 既存テストの誤った期待値を反転する
- コメント、返信、reaction の削除整合性を再確認する

### 検証方針

- `pnpm test`
- `pnpm run check`

---

## Issue 2: 本文中の note/nevent 引用が e タグ化され replyTo 判定を壊す

- 優先度: Must
- 分類: bug, nostr-spec, interoperability
- 関連ファイル:
  - `src/shared/nostr/events.ts`
  - `src/features/comments/domain/comment-mappers.ts`

### 概要

本文に含まれる `nostr:note` / `nostr:nevent` を `e` タグとして追加しており、後段で最初の `e` を `replyTo` として解釈している。本文引用だけで返信扱いになる可能性がある。

### 背景・動機

NIP-22 では本文中の引用は `q` タグで表現できる。親子関係を表す `e` と本文引用を混在させると thread 構造が壊れる。

### 想定配置 / ownership

- `shared/nostr`: 引用タグ生成の見直し
- `comments/domain`: reply parent 抽出ロジックの見直し

### 完了条件

- 本文引用は parent/reply 用タグと分離される
- `replyTo` 判定が本文引用に影響されない
- top-level comment が誤って reply 扱いされない回帰テストを追加する

### 検証方針

- `pnpm test`
- コメント threading 系の E2E または view-model テスト追加

---

## Issue 3: mute list 実装を現行 NIP-51 private list 互換に寄せる

- 優先度: Must
- 分類: enhancement, nostr-spec, interoperability
- 関連ファイル:
  - `src/shared/browser/mute.svelte.ts`
  - `src/features/mute/application/mute-actions.ts`

### 概要

mute list の private content が NIP-44 前提になっており、現行 NIP-51 の private list 運用と互換でない。対象 tag 種別も限定的。

### 背景・動機

NIP-51 の private list は `.content` を NIP-04 で扱う前提で、他クライアントとの相互運用性を考えると現状は厳しい。`p` / `word` だけでなく、標準で扱うべき項目の整理も必要。

### 想定配置 / ownership

- `shared/browser`: load/publish フロー修正
- `features/mute/application`: publish 契約整理

### 完了条件

- 実装方針を「NIP-51 準拠」か「アプリ独自仕様」か明文化する
- 準拠を選ぶ場合は暗号方式と tag サポートを仕様に合わせる
- 既存データ互換が必要なら migration 方針を決める

### 検証方針

- `pnpm test`
- 異なる signer 実装での読書き確認

---

## Issue 4: kind:10003 bookmarks が NIP-51 標準 tag と互換でない

- 優先度: Should
- 分類: enhancement, nostr-spec, interoperability
- 関連ファイル:
  - `src/features/bookmarks/application/bookmark-actions.ts`
  - `src/features/bookmarks/domain/bookmark-model.ts`

### 概要

`kind:10003` bookmarks に `i` タグを使っている。NIP-51 bookmark list としては他クライアント互換性が低い。

### 背景・動機

アプリ内では動くが、Nostr 全体の bookmark list として交換しにくい。NIP-73 ベースの external content とどう住み分けるかも整理が必要。

### 想定配置 / ownership

- `bookmarks/domain`
- `bookmarks/application`
- 必要なら `shared/nostr`

### 完了条件

- 標準準拠に寄せるか、独自仕様として分離するか判断する
- 互換対象の tag 形式を決めて実装・テストする
- 既存 bookmark データの扱い方針を定める

### 検証方針

- `pnpm test`
- bookmark 表示と追加削除の回帰確認

---

## Issue 5: ncontent prefix を標準外拡張として明示するか NIP-19 系に寄せる

- 優先度: Should
- 分類: enhancement, interoperability
- 関連ファイル:
  - `src/shared/nostr/helpers.ts`

### 概要

`ncontent` bech32 prefix は NIP-19 の標準 prefix ではない。現在はアプリ独自拡張になっている。

### 背景・動機

内部用途だけなら成立するが、NIP-19 準拠として扱うと誤解を生む。共有導線や他クライアント連携を考えるなら表現の整理が必要。

### 想定配置 / ownership

- `shared/nostr`
- 必要なら route / resolver

### 完了条件

- `ncontent` を独自仕様として明示する、または標準寄りの表現へ移行する
- decode / route / share UI の責務を整理する
- 少なくとも README か設計メモに仕様を書いておく

### 検証方針

- `pnpm test`

---

## Issue 6: CSP を強化し unsafe-eval / unsafe-inline 依存を減らす

- 優先度: Must
- 分類: security, hardening
- 関連ファイル:
  - `src/hooks.server.ts`
  - `src/features/auth/infra/nostr-login-gateway.ts`

### 概要

現在の CSP は `unsafe-inline` と `unsafe-eval` を許可している。認証依存ライブラリも `eval` を含んでおり、XSS 緩和策として弱い。

### 背景・動機

CSP は最後の防波堤なので、現状の緩さは維持コストが高い。依存ライブラリが原因なら、置換または封じ込め方針を決めるべき。

### 想定配置 / ownership

- `hooks.server.ts`
- auth infra

### 完了条件

- `unsafe-eval` を外せるか調査する
- 難しい場合は依存の隔離・代替・ロード戦略を検討する
- CSP の許可リストを最小化する

### 検証方針

- `pnpm test`
- `pnpm run perf:bundle:summary`
- preview 上でログイン動作確認

---

## Issue 7: relay list は arrival order ではなく created_at で最新を選ぶ

- 優先度: Should
- 分類: bug, correctness, interoperability
- 関連ファイル:
  - `src/shared/nostr/relays-config.ts`
  - `src/shared/browser/relays.svelte.ts`

### 概要

kind:10002 / kind:3 の relay list を「最後に届いた packet」で採用している。複数 relay では最新イベントが最後に届く保証はない。

### 背景・動機

relay 設定が stale になると、読取漏れや書込先のズレにつながる。replaceable event の扱いとしても `created_at` ベースが自然。

### 想定配置 / ownership

- `shared/nostr`
- `shared/browser`

### 完了条件

- 候補イベントの中から `created_at` 最大を採用する
- 同タイムスタンプ時の tie-break ルールを決める
- 取得ロジックの回帰テストを追加する

### 検証方針

- `pnpm test`

---

## Issue 8: emoji picker の lazy chunk が大きすぎる

- 優先度: Should
- 分類: performance
- 関連ファイル:
  - `src/shared/browser/emoji-mart.svelte.ts`

### 概要

絵文字データの lazy chunk が bundle 最大で、初回 picker 表示コストが大きい。

### 背景・動機

監査時の bundle summary では最大 chunk が約 9.63 MiB raw / 1.16 MiB gzip。初回表示で待ち時間とメモリ消費が出やすい。

### 想定配置 / ownership

- `shared/browser`
- 必要なら build / asset 戦略

### 完了条件

- データ分割、検索 index の事前生成、部分ロードのいずれかで初回負荷を下げる
- bundle summary 上で改善を確認する

### 検証方針

- `pnpm run perf:bundle:summary`
- emoji picker 初回表示の体感確認

---

## Issue 9: 三層構造の境界を CI で強制する

- 優先度: Should
- 分類: architecture, tooling
- 関連ファイル:
  - `src/architecture/structure-guard.test.ts`
  - `scripts/check-structure.mjs`
  - `CLAUDE.md`

### 概要

現状の structure guard は legacy import 禁止しか見ておらず、`ui -> infra` や `domain -> browser API` の逸脱を自動検出できない。

### 背景・動機

実コードは今回の監査では概ね三層構造を守っていたが、将来の逸脱を防ぐ仕組みが弱い。ルールを宣言するだけでなく CI で落とす必要がある。

### 想定配置 / ownership

- `src/architecture`
- `scripts`
- 必要なら ESLint rule または import graph rule

### 完了条件

- 少なくとも次を自動検出できる:
  - `ui -> infra` 直接 import
  - `domain/application` での browser API / fetch 直使用
  - 不要な `shared -> features` 逆流
- ドキュメントの依存方向と検査ルールを一致させる

### 検証方針

- `pnpm run check:structure`
- `pnpm test`
- `pnpm graph:imports:summary`

---

## 備考

- サーバー側の `safeFetch` は redirect hop 検証、機密 header 除去、body size 制限があり、今回の監査では良好だった
- `pnpm test` は通過したが、一部 integration test で `indexedDB is not defined` のログは出ている
- `e2e/security.test.ts` はローカル preview/runtime 不安定のため結論保留
